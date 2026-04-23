import React, { createContext, useContext, useEffect, useState } from "react";
import api from "./api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const u = localStorage.getItem("ajvj_user");
    return u ? JSON.parse(u) : null;
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("ajvj_token");
    if (!token) {
      setLoading(false);
      return;
    }
    api.get("/auth/me")
      .then((r) => {
        setUser(r.data);
        localStorage.setItem("ajvj_user", JSON.stringify(r.data));
      })
      .catch(() => {
        localStorage.removeItem("ajvj_token");
        localStorage.removeItem("ajvj_user");
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    localStorage.setItem("ajvj_token", data.token);
    localStorage.setItem("ajvj_user", JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  };

  const logout = () => {
    localStorage.removeItem("ajvj_token");
    localStorage.removeItem("ajvj_user");
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAdmin: user?.role === "admin" }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
