import React from 'react';

export interface CardProps {
  id?: string;
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
}

export function Card({ id, title, subtitle, action, children, className = '', style, onClick }: CardProps) {
  return (
    <div id={id} className={`card ${className}`} style={style} onClick={onClick}>
      {(title || subtitle || action) && (
        <div className="responsive-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            {title && <h3 className="card-title">{title}</h3>}
            {subtitle && <p className="card-subtitle">{subtitle}</p>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}

export default Card;
