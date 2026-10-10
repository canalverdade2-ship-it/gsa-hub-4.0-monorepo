import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline-blue' | 'ghost' | 'danger' | 'success' | 'upload';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const sizeClass = size === 'sm' ? 'btn--sm' : size === 'lg' ? 'btn--lg' : '';
  const variantClass =
    variant === 'upload'
      ? 'btn--upload'
      : variant === 'danger'
      ? 'btn--danger'
      : variant === 'success'
      ? 'btn--success'
      : variant === 'outline-blue'
      ? 'btn--outline-blue'
      : variant === 'secondary'
      ? 'btn--secondary'
      : variant === 'ghost'
      ? 'btn--ghost'
      : 'btn--primary';

  return (
    <button
      className={`btn ${variantClass} ${sizeClass} ${className}`}
      disabled={disabled}
      {...props}
    >
      {icon && <span className="btn-icon-slot">{icon}</span>}
      {children}
    </button>
  );
}

export default Button;
