const csv = require('csv-parser');
const { Readable } = require('stream');
const { v4: uuidv4 } = require('uuid');

class DataParser {
  static validateHeaders(headers) {
    const requiredHeaders = ['prompt', 'agent_id', 'response_text'];
    const optionalHeaders = ['context', 'reference', 'metadata'];
    const allValidHeaders = [...requiredHeaders, ...optionalHeaders];
    
    const missingRequired = requiredHeaders.filter(header => !headers.includes(header));
    const invalidHeaders = headers.filter(header => !allValidHeaders.includes(header));
    
    return {
      valid: missingRequired.length === 0,
      missingRequired,
      invalidHeaders,
      warnings: invalidHeaders.length > 0 ? [`Unknown headers: ${invalidHeaders.join(', ')}`] : []
    };
  }

  static validateRow(row, rowIndex) {
    const errors = [];
    const warnings = [];

    // Check required fields
    if (!row.prompt || row.prompt.trim() === '') {
      errors.push(`Row ${rowIndex}: prompt is required`);
    }
    
    if (!row.agent_id || row.agent_id.trim() === '') {
      errors.push(`Row ${rowIndex}: agent_id is required`);
    }
    
    if (!row.response_text || row.response_text.trim() === '') {
      errors.push(`Row ${rowIndex}: response_text is required`);
    }

    // Check field lengths
    if (row.prompt && row.prompt.length > 5000) {
      warnings.push(`Row ${rowIndex}: prompt is very long (${row.prompt.length} chars)`);
    }
    
    if (row.response_text && row.response_text.length > 10000) {
      warnings.push(`Row ${rowIndex}: response_text is very long (${row.response_text.length} chars)`);
    }

    // Validate agent_id format
    if (row.agent_id && !/^[a-zA-Z0-9_-]+$/.test(row.agent_id)) {
      errors.push(`Row ${rowIndex}: agent_id contains invalid characters`);
    }

    return { errors, warnings };
  }

  static cleanRow(row) {
    const cleaned = {};
    
    // Clean and trim all string fields
    Object.keys(row).forEach(key => {
      if (typeof row[key] === 'string') {
        cleaned[key] = row[key].trim();
      } else {
        cleaned[key] = row[key];
      }
    });

    // Parse metadata if it's a JSON string
    if (cleaned.metadata && typeof cleaned.metadata === 'string') {
      try {
        cleaned.metadata = JSON.parse(cleaned.metadata);
      } catch (e) {
        console.warn(`Failed to parse metadata for row: ${cleaned.metadata}`);
        cleaned.metadata = { raw: cleaned.metadata };
      }
    }

    return cleaned;
  }

  static async parseCSVBuffer(buffer, options = {}) {
    return new Promise((resolve, reject) => {
      const results = [];
      const errors = [];
      const warnings = [];
      let headers = [];
      let headerValidation = null;

      const stream = Readable.from(buffer.toString());
      
      stream
        .pipe(csv({
          skipEmptyLines: true,
          mapHeaders: ({ header }) => header.toLowerCase().trim(),
          ...options
        }))
        .on('headers', (headersList) => {
          headers = headersList;
          headerValidation = DataParser.validateHeaders(headers);
          
          if (!headerValidation.valid) {
            return reject({
              error: 'Invalid CSV headers',
              details: headerValidation
            });
          }
          
          if (headerValidation.warnings.length > 0) {
            warnings.push(...headerValidation.warnings);
          }
        })
        .on('data', (row) => {
          const cleanedRow = DataParser.cleanRow(row);
          const validation = DataParser.validateRow(cleanedRow, results.length + 1);
          
          if (validation.errors.length > 0) {
            errors.push(...validation.errors);
          } else {
            if (validation.warnings.length > 0) {
              warnings.push(...validation.warnings);
            }
            results.push(cleanedRow);
          }
        })
        .on('end', () => {
          resolve({
            data: results,
            headers,
            errors,
            warnings,
            stats: {
              total_rows: results.length,
              valid_rows: results.length,
              error_count: errors.length,
              warning_count: warnings.length
            }
          });
        })
        .on('error', (error) => {
          reject({
            error: 'CSV parsing failed',
            details: error.message
          });
        });
    });
  }

  static async parseJSONBuffer(buffer) {
    try {
      const jsonData = JSON.parse(buffer.toString());
      
      // Handle both single object and array of objects
      const dataArray = Array.isArray(jsonData) ? jsonData : [jsonData];
      
      const errors = [];
      const warnings = [];
      const results = [];

      dataArray.forEach((row, index) => {
        const validation = DataParser.validateRow(row, index + 1);
        
        if (validation.errors.length > 0) {
          errors.push(...validation.errors);
        } else {
          if (validation.warnings.length > 0) {
            warnings.push(...validation.warnings);
          }
          results.push(DataParser.cleanRow(row));
        }
      });

      return {
        data: results,
        errors,
        warnings,
        stats: {
          total_rows: dataArray.length,
          valid_rows: results.length,
          error_count: errors.length,
          warning_count: warnings.length
        }
      };
      
    } catch (error) {
      throw {
        error: 'JSON parsing failed',
        details: error.message
      };
    }
  }

  static enhanceDataForProcessing(data, batchId) {
    return data.map(row => ({
      _id: uuidv4(),
      batch_id: batchId,
      prompt: row.prompt,
      agent_id: row.agent_id,
      response_text: row.response_text,
      context: row.context || '',
      reference: row.reference || '',
      metadata: row.metadata || {},
      status: 'pending',
      created_at: new Date(),
      updated_at: new Date()
    }));
  }

  static generateBatchSummary(parseResult, batchId) {
    const agentCounts = {};
    parseResult.data.forEach(row => {
      agentCounts[row.agent_id] = (agentCounts[row.agent_id] || 0) + 1;
    });

    return {
      batch_id: batchId,
      total_responses: parseResult.data.length,
      agent_count: Object.keys(agentCounts).length,
      agents: agentCounts,
      has_context: parseResult.data.some(row => row.context && row.context.trim() !== ''),
      has_reference: parseResult.data.some(row => row.reference && row.reference.trim() !== ''),
      parsing_errors: parseResult.errors,
      parsing_warnings: parseResult.warnings,
      status: 'uploaded'
    };
  }

  static async parseFile(buffer, filename, batchId) {
    try {
      let parseResult;
      
      // Determine file type and parse accordingly
      const fileExtension = filename.toLowerCase().split('.').pop();
      
      if (fileExtension === 'csv') {
        parseResult = await DataParser.parseCSVBuffer(buffer);
      } else if (fileExtension === 'json') {
        parseResult = await DataParser.parseJSONBuffer(buffer);
      } else {
        throw {
          error: 'Unsupported file type',
          details: `File type .${fileExtension} is not supported. Please use CSV or JSON files.`
        };
      }

      // Check if we have any valid data
      if (parseResult.data.length === 0) {
        throw {
          error: 'No valid data found',
          details: 'The file contains no valid rows after parsing and validation.'
        };
      }

      // Enhance data with processing metadata
      const enhancedData = DataParser.enhanceDataForProcessing(parseResult.data, batchId);
      
      // Generate batch summary
      const batchSummary = DataParser.generateBatchSummary(parseResult, batchId);

      return {
        success: true,
        data: enhancedData,
        batch_summary: batchSummary,
        parsing_result: {
          stats: parseResult.stats,
          errors: parseResult.errors,
          warnings: parseResult.warnings
        }
      };

    } catch (error) {
      return {
        success: false,
        error: error.error || 'Parsing failed',
        details: error.details || error.message || 'Unknown parsing error'
      };
    }
  }
}

module.exports = DataParser;