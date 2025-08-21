import React, { useState } from 'react';
import type { SearchFilters } from '../types';

interface FieldSearchProps {
  onSearch: (filters: SearchFilters) => void;
}

const FieldSearch: React.FC<FieldSearchProps> = ({ onSearch }) => {
  const [filters, setFilters] = useState<SearchFilters>({
    location: '',
    priceRange: '',
    date: '',
    time: '',
    skillLevel: '',
    ageGroup: '',
    fieldType: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(filters);
  };

  const handleChange = (field: keyof SearchFilters, value: string) => {
    setFilters(prev => ({
      ...prev,
      [field]: value
    }));
  };

  return (
    <div className="card">
      <div className="card-body">
        <h5 className="card-title mb-3">Find Football Fields</h5>
        <form onSubmit={handleSubmit}>
          <div className="row g-3">
            <div className="col-md-6">
              <label htmlFor="location" className="form-label">Location</label>
              <input
                type="text"
                className="form-control"
                id="location"
                placeholder="Enter city or area"
                value={filters.location}
                onChange={(e) => handleChange('location', e.target.value)}
              />
            </div>
            <div className="col-md-6">
              <label htmlFor="priceRange" className="form-label">Price Range</label>
              <select
                className="form-select"
                id="priceRange"
                value={filters.priceRange}
                onChange={(e) => handleChange('priceRange', e.target.value)}
              >
                <option value="">Any Price</option>
                <option value="0-50">$0 - $50</option>
                <option value="50-100">$50 - $100</option>
                <option value="100-150">$100 - $150</option>
                <option value="150+">$150+</option>
              </select>
            </div>
            <div className="col-md-6">
              <label htmlFor="date" className="form-label">Date</label>
              <input
                type="date"
                className="form-control"
                id="date"
                value={filters.date}
                onChange={(e) => handleChange('date', e.target.value)}
              />
            </div>
            <div className="col-md-6">
              <label htmlFor="time" className="form-label">Time</label>
              <input
                type="time"
                className="form-control"
                id="time"
                value={filters.time}
                onChange={(e) => handleChange('time', e.target.value)}
              />
            </div>
            <div className="col-md-6">
              <label htmlFor="skillLevel" className="form-label">Skill Level</label>
              <select
                className="form-select"
                id="skillLevel"
                value={filters.skillLevel}
                onChange={(e) => handleChange('skillLevel', e.target.value)}
              >
                <option value="">Any Level</option>
                <option value="Beginner">Beginner</option>
                <option value="Intermediate">Intermediate</option>
                <option value="Advanced">Advanced</option>
                <option value="Mixed">Mixed</option>
              </select>
            </div>
            <div className="col-md-6">
              <label htmlFor="ageGroup" className="form-label">Age Group</label>
              <select
                className="form-select"
                id="ageGroup"
                value={filters.ageGroup}
                onChange={(e) => handleChange('ageGroup', e.target.value)}
              >
                <option value="">Any Age</option>
                <option value="Youth">Youth (Under 18)</option>
                <option value="Adult">Adult (18-40)</option>
                <option value="Senior">Senior (40+)</option>
                <option value="Mixed">Mixed Ages</option>
              </select>
            </div>
            <div className="col-12">
              <button type="submit" className="btn btn-primary w-100">
                <i className="bi bi-search me-2"></i>
                Search Fields
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FieldSearch; 