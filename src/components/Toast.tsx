import React, { useEffect } from 'react';

interface ToastProps {
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  isVisible: boolean;
  onClose: () => void;
}

const Toast: React.FC<ToastProps> = ({ message, type, isVisible, onClose }) => {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose();
      }, 3000);

      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  const getToastClass = () => {
    switch (type) {
      case 'success': return 'bg-success text-white';
      case 'error': return 'bg-danger text-white';
      case 'warning': return 'bg-warning text-dark';
      case 'info': return 'bg-info text-white';
      default: return 'bg-primary text-white';
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'success': return 'bi-check-circle';
      case 'error': return 'bi-x-circle';
      case 'warning': return 'bi-exclamation-triangle';
      case 'info': return 'bi-info-circle';
      default: return 'bi-info-circle';
    }
  };

  if (!isVisible) return null;

  return (
    <div 
      className={`toast show position-fixed ${getToastClass()}`}
      style={{ 
        top: '20px', 
        right: '20px', 
        zIndex: 9999,
        minWidth: '300px'
      }}
    >
      <div className="toast-header border-0">
        <i className={`bi ${getIcon()} me-2`}></i>
        <strong className="me-auto">
          {type === 'success' && 'Success!'}
          {type === 'error' && 'Error!'}
          {type === 'warning' && 'Warning!'}
          {type === 'info' && 'Info!'}
        </strong>
        <button 
          type="button" 
          className="btn-close btn-close-white" 
          onClick={onClose}
        ></button>
      </div>
      <div className="toast-body">
        {message}
      </div>
    </div>
  );
};

export default Toast; 