import { useState } from "react";

interface Step0UserInfoProps {
  firstName: string;
  lastName: string;
  onFirstNameChange: (value: string) => void;
  onLastNameChange: (value: string) => void;
  onNext: () => void;
}

export const Step0UserInfo: React.FC<Step0UserInfoProps> = ({
  firstName,
  lastName,
  onFirstNameChange,
  onLastNameChange,
  onNext,
}) => {
  const [errors, setErrors] = useState<{
    firstName?: string;
    lastName?: string;
  }>({});

  const validate = () => {
    const newErrors: { firstName?: string; lastName?: string } = {};

    if (!firstName.trim()) {
      newErrors.firstName = "First name is required";
    }

    if (!lastName.trim()) {
      newErrors.lastName = "Last name is required";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validate()) {
      onNext();
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h2 className="text-2xl font-semibold font-heading text-alloro-navy mb-2 tracking-tight">
          Welcome to Alloro!
        </h2>
        <p className="text-slate-500 text-sm">
          Let's start by getting to know you
        </p>
      </div>

      {/* Form */}
      <div className="space-y-4">
        {/* First Name */}
        <div>
          <label
            htmlFor="firstName"
            className="block text-sm font-medium text-alloro-navy mb-2"
          >
            First Name
          </label>
          <input
            id="firstName"
            type="text"
            value={firstName}
            onChange={(e) => {
              onFirstNameChange(e.target.value);
              if (errors.firstName)
                setErrors({ ...errors, firstName: undefined });
            }}
            placeholder="Enter your first name"
            className={`w-full px-4 py-3 rounded-xl bg-white border ${
              errors.firstName ? "border-red-400" : "border-slate-300"
            } text-alloro-navy placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-alloro-orange/20 focus:border-alloro-orange transition-all`}
          />
          {errors.firstName && (
            <p className="mt-1 text-sm text-red-600">{errors.firstName}</p>
          )}
        </div>

        {/* Last Name */}
        <div>
          <label
            htmlFor="lastName"
            className="block text-sm font-medium text-alloro-navy mb-2"
          >
            Last Name
          </label>
          <input
            id="lastName"
            type="text"
            value={lastName}
            onChange={(e) => {
              onLastNameChange(e.target.value);
              if (errors.lastName)
                setErrors({ ...errors, lastName: undefined });
            }}
            placeholder="Enter your last name"
            className={`w-full px-4 py-3 rounded-xl bg-white border ${
              errors.lastName ? "border-red-400" : "border-slate-300"
            } text-alloro-navy placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-alloro-orange/20 focus:border-alloro-orange transition-all`}
          />
          {errors.lastName && (
            <p className="mt-1 text-sm text-red-600">{errors.lastName}</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4">
        <button
          onClick={handleNext}
          disabled={!firstName.trim() || !lastName.trim()}
          className={`
            w-full px-6 py-3 rounded-xl font-semibold transition-all
            ${
              firstName.trim() && lastName.trim()
                ? "bg-gradient-to-r from-alloro-orange to-[#c45a47] text-white hover:shadow-lg hover:shadow-alloro-orange/30 hover:-translate-y-0.5"
                : "bg-slate-100 text-slate-400 cursor-not-allowed"
            }
          `}
        >
          Continue
        </button>
      </div>
    </div>
  );
};
