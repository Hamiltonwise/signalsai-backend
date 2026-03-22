import React, { useState, type ReactNode } from "react";

type TooltipProps = {
  message: string | string[];
  children: ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  commaSeparated?: boolean;
  align?: "left" | "center" | "right";
};

const Tooltip: React.FC<TooltipProps> = ({
  message,
  children,
  position = "top",
  commaSeparated = false,
  align = "left",
}) => {
  const [isVisible, setIsVisible] = useState(false);

  const positionClasses = {
    top: "bottom-full left-1/2 transform -translate-x-1/2 mb-2",
    bottom: "top-full left-1/2 transform -translate-x-1/2 mt-2",
    left: "right-full top-1/2 transform -translate-y-1/2 mr-2",
    right: "left-full top-1/2 transform -translate-y-1/2 ml-2",
  };

  const alignClasses = {
    left: "text-left",
    center: "text-center",
    right: "text-right",
  };

  return (
    <div
      className="relative inline-block"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div
          className={`absolute whitespace-nowrap bg-gray-800 text-white text-xs rounded-md py-1 px-2 shadow-md z-10 ${alignClasses[align]} ${positionClasses[position]}`}
        >
          {Array.isArray(message)
            ? commaSeparated
              ? message.join(", ")
              : message.map((item, index) => <div key={index}>{item}</div>)
            : message}
        </div>
      )}
    </div>
  );
};

export default Tooltip;
