import React from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import termsMarkdown from "../../docs/MARKDOWN/Layercake_Maps_Terms_and_Conditions.md?raw";

export default function Terms() {
  return (
    <div className="page-main auth-page">
      <div className="admin-card auth-page__card terms-page">
        <article className="terms-page__markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{termsMarkdown}</ReactMarkdown>
        </article>
        <p className="auth-page__footer" style={{ marginTop: 28 }}>
          <Link to="/signup">Back to sign up</Link>
        </p>
      </div>
    </div>
  );
}
