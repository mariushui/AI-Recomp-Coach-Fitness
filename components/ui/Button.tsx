
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
}

const Button: React.FC<ButtonProps> = ({ children, isLoading, ...props }) => {
  return (
    <button
      className="w-full flex justify-center items-center text-cyber-black bg-cyber-orange hover:bg-[#FF8533] focus:ring-4 focus:ring-cyber-orange/30 font-black uppercase italic tracking-tighter rounded-xl text-lg px-5 py-4 text-center transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_5px_15px_rgba(255,107,0,0.4)]"
      disabled={isLoading}
      {...props}
    >
      {isLoading && (
        <svg className="animate-spin -ml-1 mr-3 h-6 w-6 text-cyber-black" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      {children}
    </button>
  );
};

export default Button;
