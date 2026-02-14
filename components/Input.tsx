import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

const Input: React.FC<InputProps> = ({ label, className = '', ...props }) => {
  return (
    <div className="w-full">
      {label && <label className="block text-sm font-medium text-rpg-muted mb-1">{label}</label>}
      <input 
        className={`w-full bg-rpg-800 border border-rpg-700 text-rpg-text rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-rpg-accent focus:border-transparent placeholder-rpg-600 transition-colors ${className}`}
        {...props}
      />
    </div>
  );
};

export default Input;