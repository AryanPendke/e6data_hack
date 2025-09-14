// Helper functions for managing batch IDs in localStorage
// Since your backend doesn't have a dedicated batches list endpoint

export const batchStorage = {
  // Save a batch ID when upload completes
  saveBatch: (batchData) => {
    const stored = localStorage.getItem('agenteval-batches');
    const batches = stored ? JSON.parse(stored) : [];
    
    const newBatch = {
      id: batchData.batch_id,
      name: batchData.filename || `Batch ${batchData.batch_id.slice(0, 8)}`,
      created_at: new Date().toISOString(),
      total_responses: batchData.summary?.total_responses || 0,
      status: 'uploaded'
    };
    
    // Add to beginning of array (most recent first)
    batches.unshift(newBatch);
    
    // Keep only last 50 batches
    const trimmed = batches.slice(0, 50);
    localStorage.setItem('agenteval-batches', JSON.stringify(trimmed));
    
    return newBatch;
  },
  
  // Get all stored batches
  getBatches: () => {
    const stored = localStorage.getItem('agenteval-batches');
    return stored ? JSON.parse(stored) : [];
  },
  
  // Update batch status
  updateBatchStatus: (batchId, status) => {
    const batches = batchStorage.getBatches();
    const updated = batches.map(batch => 
      batch.id === batchId ? { ...batch, status, updated_at: new Date().toISOString() } : batch
    );
    localStorage.setItem('agenteval-batches', JSON.stringify(updated));
    return updated;
  },
  
  // Clear all batches
  clearBatches: () => {
    localStorage.removeItem('agenteval-batches');
  }
};
