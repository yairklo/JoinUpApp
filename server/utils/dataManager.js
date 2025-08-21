const fs = require('fs').promises;
const path = require('path');

class DataManager {
  constructor() {
    this.dataDir = path.join(__dirname, '..', 'data');
  }

  // Read data from JSON file
  async readData(filename) {
    try {
      const filePath = path.join(this.dataDir, filename);
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        // File doesn't exist, return empty array
        return [];
      }
      throw error;
    }
  }

  // Write data to JSON file
  async writeData(filename, data) {
    const filePath = path.join(this.dataDir, filename);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  }

  // Find item by ID
  async findById(filename, id) {
    const data = await this.readData(filename);
    return data.find(item => item.id === id);
  }

  // Add new item
  async addItem(filename, item) {
    const data = await this.readData(filename);
    const newItem = {
      ...item,
      id: item.id || this.generateId(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    data.push(newItem);
    await this.writeData(filename, data);
    return newItem;
  }

  // Update item
  async updateItem(filename, id, updates) {
    const data = await this.readData(filename);
    const index = data.findIndex(item => item.id === id);
    
    if (index === -1) {
      throw new Error('Item not found');
    }

    data[index] = {
      ...data[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };

    await this.writeData(filename, data);
    return data[index];
  }

  // Delete item
  async deleteItem(filename, id) {
    const data = await this.readData(filename);
    const filteredData = data.filter(item => item.id !== id);
    
    if (filteredData.length === data.length) {
      throw new Error('Item not found');
    }

    await this.writeData(filename, filteredData);
    return { message: 'Item deleted successfully' };
  }

  // Generate unique ID
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // Search items
  async searchItems(filename, query) {
    const data = await this.readData(filename);
    return data.filter(item => {
      return Object.keys(query).every(key => {
        if (typeof query[key] === 'string') {
          return item[key] && item[key].toLowerCase().includes(query[key].toLowerCase());
        }
        return item[key] === query[key];
      });
    });
  }
}

module.exports = new DataManager(); 