import React from 'react';

interface FieldCardProps {
  id: string;
  name: string;
  location: string;
  price: number;
  rating: number;
  image: string;
  available: boolean;
  onBook: (id: string) => void;
}

const FieldCard: React.FC<FieldCardProps> = ({
  id,
  name,
  location,
  price,
  rating,
  image,
  available,
  onBook
}) => {
  return (
    <div className="card h-100 shadow-sm" style={{ maxWidth: '320px' }}>
      <img 
        src={image} 
        className="card-img-top" 
        alt={name}
        style={{ height: '140px', objectFit: 'cover' }}
      />
      <div className="card-body p-3 d-flex flex-column">
        <h6 className="card-title mb-1">{name}</h6>
        <p className="card-text text-muted small mb-2">
          <i className="bi bi-geo-alt"></i> {location}
        </p>
        <div className="d-flex justify-content-between align-items-center mb-2">
          <span className="badge bg-success">${price}/hour</span>
          <div className="d-flex align-items-center">
            <i className="bi bi-star-fill text-warning me-1"></i>
            <span>{rating}/5</span>
          </div>
        </div>
        <div className="mt-auto">
          {available ? (
            <button 
              className="btn btn-primary btn-sm w-100"
              onClick={() => onBook(id)}
            >
              <i className="bi bi-calendar-check me-2"></i>
              Book Now
            </button>
          ) : (
            <button className="btn btn-secondary btn-sm w-100" disabled>
              <i className="bi bi-x-circle me-2"></i>
              Not Available
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default FieldCard; 