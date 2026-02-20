"use client";

import { Cormorant_Garamond, Noto_Sans_KR } from "next/font/google";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./page.module.css";

type MeResponse = { ok: boolean; loggedIn?: boolean };

const displayFont = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700"],
});

const bodyFont = Noto_Sans_KR({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["400", "500", "700"],
});

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signup" | "login">("signup");
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"error" | "success" | "info">("info");
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: MeResponse) => setLoggedIn(Boolean(data.ok && data.loggedIn)))
      .catch(() => undefined);
  }, []);

  async function submit() {
    setLoading(true);
    setMessage("");
    setMessageType("info");
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: loginId, password }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string; code?: string };
      if (!res.ok || !data.ok) {
        setMessageType("error");
        if (mode === "login" && data.code === "ID_NOT_FOUND") {
          setMessage("등록되지 않은 아이디입니다. 먼저 회원가입을 진행해 주세요.");
          return;
        }
        if (mode === "login" && data.code === "PASSWORD_MISMATCH") {
          setMessage("비밀번호가 일치하지 않습니다.");
          return;
        }
        if (mode === "signup" && data.code === "ID_CONFLICT") {
          setMessage("이미 사용 중인 아이디입니다. 다른 아이디를 입력해 주세요.");
          return;
        }
        setMessage(data.error ?? "요청 실패");
        return;
      }
      setMessageType("success");
      setMessage(mode === "signup" ? "회원가입 및 로그인 완료. 캐릭터 선택으로 이동합니다." : "로그인 완료. 캐릭터 선택으로 이동합니다.");
      router.push("/character");
    } catch (e) {
      setMessageType("error");
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    setLoading(true);
    setMessage("");
    setMessageType("info");
    try {
      const res = await fetch("/api/auth/logout", { method: "POST" });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setMessageType("error");
        setMessage(data.error ?? "로그아웃 실패");
        return;
      }
      setLoggedIn(false);
      setMessageType("success");
      setMessage("로그아웃 완료");
    } catch (e) {
      setMessageType("error");
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className={`${styles.page} ${displayFont.variable} ${bodyFont.variable}`}>
      <section className={styles.card}>
        <div className={styles.headerRow}>
          <div>
            <h1 className={styles.title}>계정 인증</h1>
            <p className={styles.sub}>아이디와 비밀번호로 가입하고 로그인합니다.</p>
          </div>
          {loggedIn ? (
            <button className={styles.ghostBtn} onClick={logout} disabled={loading}>
              로그아웃
            </button>
          ) : null}
        </div>

        <div className={styles.modeRow}>
          <button className={mode === "signup" ? styles.modeActive : styles.modeBtn} onClick={() => setMode("signup")} disabled={loading}>
            회원가입
          </button>
          <button className={mode === "login" ? styles.modeActive : styles.modeBtn} onClick={() => setMode("login")} disabled={loading}>
            로그인
          </button>
        </div>

        <div className={styles.form}>
          <div className={styles.modeGuide}>
            {mode === "signup" ? "처음이면 회원가입 후 바로 로그인됩니다." : "기존 계정으로 로그인하세요."}
          </div>
          <label className={styles.label}>아이디</label>
          <input className={styles.input} value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="id" />
          <label className={styles.label}>비밀번호</label>
          <input className={styles.input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" />
          <button className={styles.primaryBtn} onClick={submit} disabled={loading || !loginId.trim() || !password}>
            {mode === "signup" ? "회원가입" : "로그인"}
          </button>
        </div>

        {message ? <p className={`${styles.message} ${styles[messageType]}`}>{message}</p> : null}
      </section>
    </main>
  );
}
