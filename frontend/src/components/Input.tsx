import React, { useState } from "react";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
};

const EyeIcon = ({ open }: { open: boolean }) =>
  open ? (
    // Eye open SVG
    <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
      <path
        d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"
        stroke="#888"
        strokeWidth="2"
        fill="none"
      />
      <circle cx="12" cy="12" r="3" stroke="#888" strokeWidth="2" fill="none" />
    </svg>
  ) : (
    // Eye closed SVG
    <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
      <path
        d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"
        stroke="#888"
        strokeWidth="2"
        fill="none"
      />
      <circle cx="12" cy="12" r="3" stroke="#888" strokeWidth="2" fill="none" />
      <line x1="4" y1="20" x2="20" y2="4" stroke="#888" strokeWidth="2" />
    </svg>
  );

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ leftIcon, rightIcon, className = "", type, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const isPassword = type === "password";

    // Determine input type for password fields
    const inputType = isPassword ? (showPassword ? "text" : "password") : type;

    // For password fields, show eye icon as rightIcon
    const renderRightIcon = () => {
      if (isPassword) {
        return (
          <button
            type="button"
            tabIndex={-1}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 focus:outline-none"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            <EyeIcon open={showPassword} />
          </button>
        );
      }
      if (rightIcon) {
        return (
          <span className="absolute right-3 top-1/2 transform -translate-y-1/2">
            {rightIcon}
          </span>
        );
      }
      return null;
    };

    return (
      <div className="relative">
        {leftIcon && (
          <span className="absolute left-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
            {leftIcon}
          </span>
        )}
        <input
          ref={ref}
          type={inputType}
          className={[
            "w-full",
            leftIcon ? "pl-10" : "",
            rightIcon || isPassword ? "pr-12" : "",
            "py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500",
            className,
          ].join(" ")}
          {...props}
        />
        {renderRightIcon()}
      </div>
    );
  }
);

Input.displayName = "Input";

export default Input;
