import { create } from "zustand";
import { persist } from "zustand/middleware";

export const persistZustandStore = (initializer, entityName, properties) => {
  const mode = "development";
  const storageName = `zpp:${mode.substring(0, 3)}:${entityName}`;

  const persistOptions = {
    name: storageName,
    storage: {
      getItem: (name) => {
        const value = window.sessionStorage.getItem(name);
        if (!value) return null;
        return JSON.parse(value);
      },
      setItem: (name, value) => {
        const serialized = JSON.stringify(value);
        window.sessionStorage.setItem(name, serialized);
      },
      removeItem: (name) => window.sessionStorage.removeItem(name),
    },
  };

  if (properties) {
    persistOptions["partialize"] = (state) => {
      return properties.reduce((acc, key) => {
        acc[key] = state[key];

        return acc;
      }, {});
    };
  }

  return create()(persist(initializer, persistOptions));
};
