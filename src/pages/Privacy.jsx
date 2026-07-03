import React from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import privacyMarkdown from "../../docs/MARKDOWN/Layercake_Maps_Privacy_Notice.md?raw";

export default function Privacy() {
  return (
    <div className="page-main auth-page">
      <div className="admin-card auth-page__card terms-page">
        <article className="terms-page__markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{privacyMarkdown}</ReactMarkdown>
        </article>
        <p className="auth-page__footer" style={{ marginTop: 28 }}>
          <Link to="/">Back to home</Link>
        </p>
      </div>
    </div>
  );
}
