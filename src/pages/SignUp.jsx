import React from "react";
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

export default function SignUp() {
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
              <span>Verify your email from the link we send you</span>
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
        <div className="signup-split__card">
          <h1 className="signup-split__cardTitle">Sign up for free</h1>
          <p className="signup-split__cardSub">
            Create your Layercake Maps account. We’ll email you a link to verify your address—then you can open My Maps
            and start building.
          </p>
          <AuthForm mode="signup" variant="split" />
          <p className="signup-split__footer">
            Already have an account? <Link to="/login">Log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
