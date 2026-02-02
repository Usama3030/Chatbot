
import os
import pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS
import sqlite3
from sqlalchemy import create_engine
from groq import Groq
import re
from difflib import get_close_matches
from werkzeug.utils import secure_filename
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# CONFIG
UPLOAD_FOLDER = "./assets"
ALLOWED_EXTENSIONS = {'csv', 'xlsx', 'xls'}
DB_FILE = "data.db"

# Create assets folder if it doesn't exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Get API key from environment
GROQ_API_KEY = os.getenv("GROQ_API_KEY")
if not GROQ_API_KEY:
    raise ValueError("GROQ_API_KEY not found in environment variables!")

# Initialize Flask app
app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024  # 16MB max file size

CORS(app, 
     resources={r"/api/*": {"origins": "*"}},
     allow_headers=["Content-Type", "Authorization"],
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
     supports_credentials=True)

# Global variables to store current dataset
current_df = None
current_table_name = None
current_columns = []
current_category_values = {}

# Initialize Groq client
groq_client = Groq(api_key=GROQ_API_KEY)


# Helper functions
def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def load_data_to_db(file_path: str):
    """Load CSV/Excel file into SQLite database"""
    global current_df, current_table_name, current_columns, current_category_values
    
    # Load file
    if file_path.endswith(".csv"):
        current_df = pd.read_csv(file_path)
    elif file_path.endswith((".xls", ".xlsx")):
        current_df = pd.read_excel(file_path, engine="openpyxl")
    else:
        raise ValueError("Unsupported file format")
    
    # Set table name
    current_table_name = os.path.splitext(os.path.basename(file_path))[0].lower()
    
    # Save to SQLite
    engine = create_engine(f"sqlite:///{DB_FILE}")
    current_df.to_sql(current_table_name, engine, if_exists="replace", index=False)
    
    # Store columns
    current_columns = list(current_df.columns)
    
    # Get sample unique values for categorical columns
    current_category_values = {}
    for col in current_columns:
        unique_vals = current_df[col].dropna().unique()
        if len(unique_vals) < 100:
            current_category_values[col] = list(unique_vals)[:20]
    
    print(f"✅ Data loaded into SQLite. Table: {current_table_name}")
    return current_table_name


def run_sql(query: str):
    conn = sqlite3.connect(DB_FILE)
    cur = conn.cursor()
    try:
        cur.execute(query)
        rows = cur.fetchall()
        cols = [desc[0] for desc in cur.description] if cur.description else []
        return cols, rows
    finally:
        conn.close()


def safe_column(col_name: str) -> str:
    """Wrap column names in square brackets if they contain spaces or special characters."""
    if re.search(r"\W", col_name):
        return f"[{col_name}]"
    return col_name


def find_closest_category_value(user_input: str, column_name: str) -> str:
    """Find the closest matching value in the actual data for a given column."""
    if column_name not in current_category_values:
        return None
    
    possible_values = current_category_values[column_name]
    normalized_input = user_input.lower().replace("/", " ").replace("-", " ")
    
    # Try exact match first
    for val in possible_values:
        if str(val).lower() == normalized_input:
            return str(val)
    
    # Try contains match
    for val in possible_values:
        val_normalized = str(val).lower().replace("/", " ").replace("-", " ")
        if normalized_input in val_normalized or val_normalized in normalized_input:
            return str(val)
    
    # Try fuzzy match
    normalized_values = [str(v).lower().replace("/", " ").replace("-", " ") for v in possible_values]
    matches = get_close_matches(normalized_input, normalized_values, n=1, cutoff=0.6)
    
    if matches:
        idx = normalized_values.index(matches[0])
        return str(possible_values[idx])
    
    return None

def is_file_related_question_ai(question: str) -> bool:
    prompt = f"""
You are an intent classifier.

Decide whether the user's question is related to analyzing or querying a dataset.

Respond with ONLY one word:
YES → if the question is about data, columns, values, counts, filters, trends, summaries.
NO → if the question is greeting, small talk, names, personal questions, commands, or anything unrelated.

Question:
{question}
"""

    response = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": "You classify intent. Output ONLY YES or NO."},
            {"role": "user", "content": prompt}
        ],
        temperature=0
    )

    answer = response.choices[0].message.content.strip().upper()
    return answer == "YES"


def generate_sql(user_question):
    """Generate SQL query using Groq LLM"""
    if not current_table_name or not current_columns:
        raise ValueError("No data loaded. Please upload a file first.")
    
    safe_table_name = safe_column(current_table_name)
    
    # Build column info with sample values
    column_info = []
    for col in current_columns:
        col_safe = safe_column(col)
        if col in current_category_values:
            samples = current_category_values[col][:5]
            column_info.append(f"{col_safe} (examples: {', '.join(map(str, samples))})")
        else:
            column_info.append(col_safe)

    system_prompt = f"""
You are a SQL expert generating queries for SQLite.

Database: SQLite
Table name: {safe_table_name}

Columns with sample values:
{chr(10).join(column_info)}

CRITICAL RULES:
1. Generate ONLY valid SQLite SQL
2. Wrap any column or table name with spaces or special characters in square brackets, e.g., [Total Hours]
3. Use EXACT column values as shown in examples (including slashes, spaces, hyphens)
4. Use LIKE with wildcards for partial text matching: WHERE column LIKE '%value%'
5. For categories, use the EXACT format from examples (e.g., "Slip/Trip/Fall" not "Slip Trip")
6. Do NOT explain anything
7. Return SQL query ONLY
8. Do NOT include markdown code blocks or backticks
"""

    response = groq_client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_question}
        ],
        temperature=0
    )

    sql = response.choices[0].message.content.strip()
    sql = sql.replace("```sql", "").replace("```", "").strip()

    print(f"Generated SQL: {sql}")
    return sql


def preprocess_question(question: str) -> str:
    """Replace fuzzy category terms in question with exact database values."""
    processed = question
    
    # Common patterns to check
    patterns = {
        r'\bslip\s+trip\b': lambda: find_closest_category_value("slip trip", "Incident_Type_Category") or "slip trip",
        r'\bnear\s+miss\b': lambda: find_closest_category_value("near miss", "Incident_Type") or "near miss",
    }
    
    for pattern, replacement_func in patterns.items():
        if re.search(pattern, processed, re.IGNORECASE):
            replacement = replacement_func()
            processed = re.sub(pattern, replacement, processed, flags=re.IGNORECASE)
    
    # Auto-detect and replace category values
    words = question.lower().split()
    for i in range(len(words) - 2):
        phrase = " ".join(words[i:i+3])
        for col in current_category_values.keys():
            match = find_closest_category_value(phrase, col)
            if match and match.lower() != phrase:
                processed = processed.replace(phrase, match)
                break
    
    return processed


# ============= API ROUTES =============

@app.route("/api/upload", methods=["POST", "OPTIONS"])
def upload_file():
    """Upload CSV/Excel file to assets folder"""
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200
    
    try:
        # Check if file is in request
        if 'file' not in request.files:
            return jsonify({"error": "No file part in request"}), 400
        
        file = request.files['file']
        
        # Check if file is selected
        if file.filename == '':
            return jsonify({"error": "No file selected"}), 400
        
        # Validate file type
        if not allowed_file(file.filename):
            return jsonify({"error": f"Invalid file type. Allowed: {', '.join(ALLOWED_EXTENSIONS)}"}), 400
        
        # Secure filename and save
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)
        
        # Load the file into database
        table_name = load_data_to_db(filepath)
        
        return jsonify({
            "message": "File uploaded successfully",
            "filename": filename,
            "table_name": table_name,
            "rows": len(current_df),
            "columns": current_columns
        }), 200
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/files", methods=["GET"])
def list_files():
    """List all available files in assets folder"""
    try:
        files = []
        for filename in os.listdir(UPLOAD_FOLDER):
            if allowed_file(filename):
                filepath = os.path.join(UPLOAD_FOLDER, filename)
                file_info = {
                    "filename": filename,
                    "size": os.path.getsize(filepath),
                    "modified": os.path.getmtime(filepath)
                }
                files.append(file_info)
        
        return jsonify({
            "files": files,
            "current_file": current_table_name
        }), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/select-file", methods=["POST", "OPTIONS"])
def select_file():
    """Select a file from assets folder to work with"""
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200
    
    try:
        body = request.get_json()
        if not body or "filename" not in body:
            return jsonify({"error": "Filename is required"}), 400
        
        filename = secure_filename(body["filename"])
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        
        if not os.path.exists(filepath):
            return jsonify({"error": "File not found"}), 404
        
        # Load the selected file
        table_name = load_data_to_db(filepath)
        
        return jsonify({
            "message": "File selected successfully",
            "filename": filename,
            "table_name": table_name,
            "rows": len(current_df),
            "columns": current_columns
        }), 200
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/chat/csv/groq", methods=["POST", "OPTIONS"])
def chat_csv_groq():
    """Query the current dataset using natural language"""
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200
    
    try:
        # Check if data is loaded
        if current_df is None or current_df.empty:
            return jsonify({"error": "No data loaded. Please upload or select a file first."}), 400
        
        body = request.get_json()
        if not body:
            return jsonify({"error": "Invalid JSON body"}), 400
            
        question = body.get("question", "").strip()
        if not question:
            return jsonify({"error": "Question is required"}), 400
        
        is_related = is_file_related_question_ai(question)
        if not is_related:
            return jsonify({
                "result": [],
                "message": "Please ask a question related to the uploaded file."
            }), 200

        # Preprocess question to replace fuzzy terms
        processed_question = preprocess_question(question)
        print(f"Original: {question}")
        print(f"Processed: {processed_question}")
        
        sql = generate_sql(processed_question)
        cols, rows = run_sql(sql)
        result = [dict(zip(cols, r)) for r in rows]
        
        return jsonify({
            "sql": sql, 
            "result": result,
            "processed_question": processed_question,
            "current_file": current_table_name
        }), 200
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@app.route("/api/health", methods=["GET"])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "ok",
        "table": current_table_name,
        "columns": current_columns,
        "category_samples": current_category_values,
        "rows": len(current_df) if current_df is not None else 0,
        "data_loaded": current_df is not None
    }), 200


@app.route("/api/categories", methods=["GET"])
def get_categories():
    """Return all unique category values for frontend reference"""
    if not current_category_values:
        return jsonify({"error": "No data loaded"}), 400
    return jsonify(current_category_values), 200


@app.route("/api/delete-file/<filename>", methods=["DELETE", "OPTIONS"])
def delete_file(filename):
    """Delete a file from assets folder"""
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200
    
    try:
        filename = secure_filename(filename)
        filepath = os.path.join(UPLOAD_FOLDER, filename)
        
        if not os.path.exists(filepath):
            return jsonify({"error": "File not found"}), 404
        
        os.remove(filepath)
        
        # If deleted file was the current one, clear current data
        if current_table_name and current_table_name == os.path.splitext(filename)[0].lower():
            globals()['current_df'] = None
            globals()['current_table_name'] = None
            globals()['current_columns'] = []
            globals()['current_category_values'] = {}
        
        return jsonify({"message": "File deleted successfully"}), 200
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# Error handlers
@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Endpoint not found"}), 404

@app.errorhandler(500)
def internal_error(e):
    return jsonify({"error": "Internal server error"}), 500


# START SERVER
if __name__ == "__main__":
    # Try to load default file if exists
    default_files = ["Incidents_Clean_Data.csv", "Inspection_Clean_Data.csv", "data.csv"]
    for default_file in default_files:
        default_path = os.path.join(UPLOAD_FOLDER, default_file)
        if os.path.exists(default_path):
            try:
                load_data_to_db(default_path)
                print(f"✅ Loaded default file: {default_file}")
                break
            except Exception as e:
                print(f"⚠️ Could not load default file {default_file}: {e}")
    
    app.run(host="0.0.0.0", port=4000, debug=True)