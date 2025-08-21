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
    <div className="card h-100 shadow-sm">
      <img 
        src={image} 
        className="card-img-top" 
        alt={name}
        style={{ height: '200px', objectFit: 'cover' }}
      />
      <div className="card-body d-flex flex-column">
        <h5 className="card-title">{name}</h5>
        <p className="card-text text-muted">
          <i className="bi bi-geo-alt"></i> {location}
        </p>
        <div className="d-flex justify-content-between align-items-center mb-3">
          <span className="badge bg-success">${price}/hour</span>
          <div className="d-flex align-items-center">
            <i className="bi bi-star-fill text-warning me-1"></i>
            <span>{rating}/5</span>
          </div>
        </div>
        <div className="mt-auto">
          {available ? (
            <button 
              className="btn btn-primary w-100"
              onClick={() => onBook(id)}
            >
              <i className="bi bi-calendar-check me-2"></i>
              Book Now
            </button>
          ) : (
            <button className="btn btn-secondary w-100" disabled>
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