import React, { useState } from "react";
import { Link } from "react-router-dom";
import BrandLogo from "../components/BrandLogo.jsx";
import AuthForm from "../components/AuthForm.jsx";
import "./auth-signup-split.css";

function CheckIcon() {
  return (
    <svg className="signup-split__check" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="10" fill="currentColor" />
      <path
        d="M6 10.2l2.4 2.2L14 7"
        stroke="#fff"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SuccessBadge() {
  return (
    <div className="signup-success__badge" aria-hidden="true">
      <svg viewBox="0 0 48 48" fill="none">
        <circle cx="24" cy="24" r="24" fill="currentColor" />
        <path
          d="M14 24.5l6.5 6.5L34 17.5"
          stroke="#fff"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function MailIcon() {
  return (
    <svg className="signup-success__tip-icon" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M3.5 5.5h13a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="m3.5 6.5 6.5 5 6.5-5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SignUpSuccess({ email, notice, needsEmailVerification, onReset }) {
  const title = needsEmailVerification
    ? "Check your email to finish signing up"
    : "You're all set—welcome aboard";

  return (
    <div className="signup-success" role="status" aria-live="polite">
      <SuccessBadge />
      <p className="signup-success__eyebrow">Account created</p>
      <h1 className="signup-success__title">{title}</h1>
      {needsEmailVerification ? (
        <>
          <p className="signup-success__body">
            We&rsquo;ve sent a verification link to
            <br />
            <strong className="signup-success__email">{email}</strong>
          </p>
          <p className="signup-success__body signup-success__body--muted">
            Click the link in that email to confirm your address, then come back and log in to start building your map.
          </p>

          <div className="signup-success__tip">
            <MailIcon />
            <span>
              Can&rsquo;t see it? Give it a minute, then check your spam or promotions folder.
            </span>
          </div>
        </>
      ) : (
        <p className="signup-success__body">
          Your account for <strong className="signup-success__email">{email}</strong> is ready. Log in to start building
          your map.
        </p>
      )}

      {notice ? <p className="signup-success__notice">{notice}</p> : null}

      <div className="signup-success__actions">
        <Link to="/login" className="signup-success__primary">
          Go to log in
        </Link>
        <button type="button" className="signup-success__secondary" onClick={onReset}>
          Use a different email
        </button>
      </div>
    </div>
  );
}

export default function SignUp() {
  const [submitted, setSubmitted] = useState(null);

  return (
    <div className="signup-split">
      <div className="signup-split__left">
        <div>
          <div className="signup-split__logo">
            <BrandLogo to="/" />
          </div>
          <h1 className="signup-split__headline">
            Start your free account and put your directory on the map—no credit card required.
          </h1>
          <ul className="signup-split__list">
            <li>
              <CheckIcon />
              <span>Build interactive maps with listings, pins, and your branding</span>
            </li>
            <li>
              <CheckIcon />
              <span>Sync data from spreadsheets and keep everything in one place</span>
            </li>
            <li>
              <CheckIcon />
              <span>Embed maps on your site and share with your team</span>
            </li>
          </ul>
          <h2 className="signup-split__subhead">Get set up in minutes</h2>
          <ul className="signup-split__list">
            <li>
              <CheckIcon />
              <span>Create your password and verify your email</span>
            </li>
            <li>
              <CheckIcon />
              <span>Create your first map and add locations</span>
            </li>
            <li>
              <CheckIcon />
              <span>Publish and embed when you’re ready</span>
            </li>
          </ul>
        </div>
        <p className="signup-split__footnote">
          Free tier limits may apply. Features and usage are subject to change—see Terms for details.
        </p>
      </div>

      <div className="signup-split__right">
        <div className={`signup-split__card${submitted ? " signup-split__card--success" : ""}`}>
          {submitted ? (
            <SignUpSuccess
              email={submitted.email}
              notice={submitted.notice}
              needsEmailVerification={submitted.needsEmailVerification}
              onReset={() => setSubmitted(null)}
            />
          ) : (
            <>
              <h1 className="signup-split__cardTitle">Sign up for free</h1>
              <p className="signup-split__cardSub">
                Create your Layercake Maps account with email and password. We will email a verification link before
                first login.
              </p>
              <AuthForm
                mode="signup"
                variant="split"
                onSubmitted={({ email, needsEmailVerification, notice }) =>
                  setSubmitted({
                    email,
                    needsEmailVerification,
                    notice:
                      notice ||
                      (needsEmailVerification
                        ? null
                        : "Your email is already verified—you can log in now."),
                  })
                }
              />
              <p className="signup-split__footer">
                Already have an account? <Link to="/login">Log in</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
