
import React from 'react';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
}

const Textarea: React.FC<TextareaProps> = ({ label, id, ...props }) => {
  return (
    <div className="group">
      <label htmlFor={id} className="block mb-2 text-[10px] font-black uppercase tracking-widest text-cyber-purple group-focus-within:text-cyber-green transition-colors">{label}</label>
      <textarea
        id={id}
        rows={props.rows || 4}
        className="bg-cyber-black/50 border border-cyber-purple/30 text-white text-sm font-bold rounded-xl focus:ring-2 focus:ring-cyber-green focus:border-cyber-green block w-full p-3.5 transition-all outline-none placeholder-white/10 custom-scrollbar resize-none"
        {...props}
      ></textarea>
    </div>
  );
};

export default Textarea;
