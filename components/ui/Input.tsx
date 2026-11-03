
import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
}

const Input: React.FC<InputProps> = ({ label, id, ...props }) => {
  return (
    <div className="group">
      <label htmlFor={id} className="block mb-2 text-[10px] font-black uppercase tracking-widest text-cyber-purple group-focus-within:text-cyber-green transition-colors">{label}</label>
      <input
        id={id}
        className="bg-cyber-black/50 border border-cyber-purple/30 text-white text-sm font-bold rounded-xl focus:ring-2 focus:ring-cyber-green focus:border-cyber-green block w-full p-3.5 transition-all outline-none placeholder-white/20"
        {...props}
      />
    </div>
  );
};

export default Input;
