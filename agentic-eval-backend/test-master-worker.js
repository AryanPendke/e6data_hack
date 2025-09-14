#!/usr/bin/env node

/**
 * Test script for the Master-Worker pattern
 * This script helps verify that the new queue system works correctly
 */

const axios = require('axios');

const BASE_URL = 'http://localhost:3001';

class MasterWorkerTester {
  constructor() {
    this.testResults = [];
  }

  async runAllTests() {
    console.log('🧪 Starting Master-Worker Pattern Tests...\n');

    try {
      // Test 1: Health Check
      await this.testHealthCheck();

      // Test 2: System Status
      await this.testSystemStatus();

      // Test 3: Worker Status
      await this.testWorkerStatus();

      // Test 4: Queue Status
      await this.testQueueStatus();

      // Test 5: Sample Data Generation
      await this.testSampleDataGeneration();

      // Test 6: Queue Monitoring
      await this.testQueueMonitoring();

      // Test 7: Results Monitoring
      await this.testResultsMonitoring();

      this.printSummary();

    } catch (error) {
      console.error('❌ Test suite failed:', error.message);
    }
  }

  async testHealthCheck() {
    console.log('🔍 Testing Health Check...');
    
    try {
      const response = await axios.get(`${BASE_URL}/health`);
      
      if (response.status === 200 && response.data.status === 'healthy') {
        this.logSuccess('Health Check', 'System is healthy');
      } else {
        this.logError('Health Check', `Unhealthy status: ${response.data.status}`);
      }
    } catch (error) {
      this.logError('Health Check', error.message);
    }
  }

  async testSystemStatus() {
    console.log('🔍 Testing System Status...');
    
    try {
      const response = await axios.get(`${BASE_URL}/api/status/system`);
      
      if (response.status === 200 && response.data.success) {
        const stats = response.data.statistics;
        this.logSuccess('System Status', 
          `Batches: ${stats.batches.total}, Main Queue: ${stats.queue.main_queue_length}`);
      } else {
        this.logError('System Status', 'Invalid response format');
      }
    } catch (error) {
      this.logError('System Status', error.message);
    }
  }

  async testWorkerStatus() {
    console.log('🔍 Testing Worker Status...');
    
    try {
      const response = await axios.get(`${BASE_URL}/api/status/workers`);
      
      if (response.status === 200 && response.data.success) {
        const summary = response.data.workers.summary;
        this.logSuccess('Worker Status', 
          `Total Workers: ${summary.total_workers}, Master: ${summary.master_active ? 'Active' : 'Inactive'}`);
      } else {
        this.logError('Worker Status', 'Invalid response format');
      }
    } catch (error) {
      this.logError('Worker Status', error.message);
    }
  }

  async testQueueStatus() {
    console.log('🔍 Testing Queue Status...');
    
    try {
      const response = await axios.get(`${BASE_URL}/api/status/queue`);
      
      if (response.status === 200 && response.data.success) {
        const queue = response.data.queue;
        this.logSuccess('Queue Status', 
          `Main: ${queue.main_queue_length}, Results: ${queue.results_queue_length}, Dimension Queues: ${Object.keys(queue.dimension_queues).length}`);
      } else {
        this.logError('Queue Status', 'Invalid response format');
      }
    } catch (error) {
      this.logError('Queue Status', error.message);
    }
  }

  async testSampleDataGeneration() {
    console.log('🔍 Testing Sample Data Generation...');
    
    try {
      const response = await axios.post(`${BASE_URL}/api/upload/sample-data`, {
        count: 5,
        agents: 2
      });
      
      if (response.status === 200 && response.data.success) {
        const batchId = response.data.batch_id;
        this.logSuccess('Sample Data', `Generated batch: ${batchId}`);
        
        // Store batch ID for monitoring
        this.testBatchId = batchId;
      } else {
        this.logError('Sample Data', 'Failed to generate sample data');
      }
    } catch (error) {
      this.logError('Sample Data', error.message);
    }
  }

  async testQueueMonitoring() {
    if (!this.testBatchId) {
      this.logError('Queue Monitoring', 'No batch ID available');
      return;
    }

    console.log('🔍 Testing Queue Monitoring...');
    
    try {
      // Wait a moment for tasks to be queued
      await this.sleep(2000);
      
      const response = await axios.get(`${BASE_URL}/api/status/queues/detailed`);
      
      if (response.status === 200 && response.data.success) {
        const stats = response.data.queue_statistics;
        this.logSuccess('Queue Monitoring', 
          `Queue Stats Retrieved - Main: ${stats.main_queue_length}, Dimension Workers: ${Object.keys(stats.dimension_queue_lengths || {}).length}`);
      } else {
        this.logError('Queue Monitoring', 'Invalid response format');
      }
    } catch (error) {
      this.logError('Queue Monitoring', error.message);
    }
  }

  async testResultsMonitoring() {
    if (!this.testBatchId) {
      this.logError('Results Monitoring', 'No batch ID available');
      return;
    }

    console.log('🔍 Testing Results Monitoring...');
    
    try {
      // Wait for some processing to occur
      await this.sleep(5000);
      
      const response = await axios.get(`${BASE_URL}/api/status/batch/${this.testBatchId}`);
      
      if (response.status === 200 && response.data.success) {
        const progress = response.data.status.progress;
        this.logSuccess('Results Monitoring', 
          `Batch Progress - Total: ${progress.total}, Completed: ${progress.completed}, Processing: ${progress.processing}`);
      } else {
        this.logError('Results Monitoring', 'Invalid response format');
      }
    } catch (error) {
      this.logError('Results Monitoring', error.message);
    }
  }

  logSuccess(test, message) {
    console.log(`✅ ${test}: ${message}`);
    this.testResults.push({ test, status: 'PASS', message });
  }

  logError(test, message) {
    console.log(`❌ ${test}: ${message}`);
    this.testResults.push({ test, status: 'FAIL', message });
  }

  printSummary() {
    console.log('\n📊 Test Summary:');
    console.log('='.repeat(50));
    
    const passed = this.testResults.filter(r => r.status === 'PASS').length;
    const failed = this.testResults.filter(r => r.status === 'FAIL').length;
    const total = this.testResults.length;
    
    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${passed} ✅`);
    console.log(`Failed: ${failed} ❌`);
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%`);
    
    if (failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.testResults
        .filter(r => r.status === 'FAIL')
        .forEach(r => console.log(`  - ${r.test}: ${r.message}`));
    }
    
    console.log('\n🎉 Master-Worker Pattern Testing Complete!');
    
    if (this.testBatchId) {
      console.log(`\n📋 Monitor your test batch: ${this.testBatchId}`);
      console.log(`   Batch Status: ${BASE_URL}/api/status/batch/${this.testBatchId}`);
      console.log(`   Results: ${BASE_URL}/api/results/batch/${this.testBatchId}`);
    }
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  const tester = new MasterWorkerTester();
  tester.runAllTests().catch(console.error);
}

module.exports = MasterWorkerTester;