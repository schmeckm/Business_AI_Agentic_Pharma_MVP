/**
 * ========================================================================
 * PRODUCTION WORKFLOW - A2A ORCHESTRATION
 * ========================================================================
 * 
 * Replaces chaotic event chains with controlled A2A workflows
 * URS-compliant pharmaceutical production orchestration
 * 
 * Developer: Markus Schmeckenbecher
 * Version: 1.0.0
 * ========================================================================
 */

export class ProductionWorkflow {
  constructor(a2aManager) {
    this.a2a = a2aManager;
    this.activeWorkflows = new Map();
    this.workflowStats = {
      total: 0,
      completed: 0,
      failed: 0,
      avgDuration: 0
    };
    
    console.log("🔗 ProductionWorkflow initialized");
  }

  /**
   * Main URS-compliant Order Analysis Workflow
   * Replaces orderAgent -> complianceAgent -> statusAgent event chain
   */
  async executeOrderAnalysisWorkflow(orderId, orderData = {}) {
    const workflowId = `order-${orderId}-${Date.now()}`;
    const workflow = {
      id: workflowId,
      orderId,
      orderData,
      steps: [],
      startTime: Date.now(),
      status: 'running',
      currentStep: 1,
      totalSteps: 3
    };

    this.activeWorkflows.set(workflowId, workflow);
    this.workflowStats.total++;

    try {
      console.log(`🚀 Starting A2A workflow ${workflowId} for order ${orderId}`);

      // ===============================================================
      // STEP 1: COMPLIANCE VALIDATION
      // ===============================================================
      workflow.currentStep = 1;
      workflow.status = 'compliance_check';
      
      console.log(`📋 Step 1/3: Compliance validation for ${orderId}`);
      
      const complianceResult = await this.executeComplianceCheck(orderId, orderData);
      
      workflow.steps.push({
        stepNumber: 1,
        name: 'compliance_validation',
        status: 'completed',
        result: complianceResult,
        duration: Date.now() - workflow.startTime,
        timestamp: new Date().toISOString()
      });

      // ===============================================================
      // STEP 2: CONDITIONAL BATCH ASSESSMENT
      // ===============================================================
      workflow.currentStep = 2;
      workflow.status = 'assessment_check';

      let assessmentResult = null;
      
      if (this.requiresBatchAssessment(complianceResult)) {
        console.log(`🔬 Step 2/3: Batch assessment required for ${orderId}`);
        
        assessmentResult = await this.executeBatchAssessment(orderId, complianceResult);
        
        workflow.steps.push({
          stepNumber: 2,
          name: 'batch_assessment',
          status: 'completed',
          result: assessmentResult,
          duration: Date.now() - workflow.startTime,
          timestamp: new Date().toISOString()
        });
      } else {
        console.log(`✅ Step 2/3: Batch assessment skipped - no critical findings`);
        
        workflow.steps.push({
          stepNumber: 2,
          name: 'batch_assessment',
          status: 'skipped',
          reason: 'No critical compliance findings',
          duration: Date.now() - workflow.startTime,
          timestamp: new Date().toISOString()
        });
      }

      // ===============================================================
      // STEP 3: FINAL STATUS UPDATE
      // ===============================================================
      workflow.currentStep = 3;
      workflow.status = 'status_update';
      
      console.log(`📊 Step 3/3: Final status update for ${orderId}`);
      
      const finalStatus = this.determineFinalStatus(workflow);
      const statusResult = await this.executeStatusUpdate(orderId, workflow, finalStatus);
      
      workflow.steps.push({
        stepNumber: 3,
        name: 'status_update',
        status: 'completed',
        result: statusResult,
        duration: Date.now() - workflow.startTime,
        timestamp: new Date().toISOString()
      });

      // ===============================================================
      // WORKFLOW COMPLETION
      // ===============================================================
      workflow.status = 'completed';
      workflow.finalStatus = finalStatus;
      workflow.duration = Date.now() - workflow.startTime;
      workflow.completedAt = new Date().toISOString();

      this.workflowStats.completed++;
      this.updateAverageDuration(workflow.duration);

      console.log(`✅ A2A workflow ${workflowId} completed in ${workflow.duration}ms - Status: ${finalStatus}`);
      
      // Cleanup after 5 minutes
      setTimeout(() => {
        this.activeWorkflows.delete(workflowId);
      }, 300000);

      return {
        workflowId,
        orderId,
        finalStatus,
        duration: workflow.duration,
        steps: workflow.steps.length,
        summary: this.generateWorkflowSummary(workflow),
        details: workflow
      };

    } catch (error) {
      workflow.status = 'failed';
      workflow.error = error.message;
      workflow.duration = Date.now() - workflow.startTime;
      workflow.failedAt = new Date().toISOString();

      this.workflowStats.failed++;

      console.error(`❌ A2A workflow ${workflowId} failed:`, error.message);
      
      this.activeWorkflows.delete(workflowId);
      
      throw new Error(`Workflow ${workflowId} failed: ${error.message}`);
    }
  }

  /**
   * Execute Compliance Check via A2A
   */
  async executeComplianceCheck(orderId, orderData) {
    try {
      return await this.a2a.requestService(
        'complianceAgent',
        'validateOrder',
        {
          orderId,
          orderData,
          checkType: 'full_compliance',
          requiredStandards: ['GMP', 'FDA', 'EMA']
        }
      );
    } catch (error) {
      console.error(`Compliance check failed for ${orderId}:`, error.message);
      return {
        status: 'ERROR',
        error: error.message,
        fallback: true,
        message: 'Compliance check unavailable - manual review required'
      };
    }
  }

  /**
   * Execute Batch Assessment via A2A
   */
  async executeBatchAssessment(orderId, complianceFindings) {
    try {
      return await this.a2a.requestService(
        'assessmentAgent',
        'assessBatchImpact',
        {
          orderId,
          complianceFindings,
          assessmentScope: 'critical_impact',
          timeframe: '24h'
        }
      );
    } catch (error) {
      console.error(`Batch assessment failed for ${orderId}:`, error.message);
      return {
        status: 'ERROR',
        error: error.message,
        fallback: true,
        message: 'Batch assessment unavailable - escalate to QA manager'
      };
    }
  }

  /**
   * Execute Status Update via A2A
   */
  async executeStatusUpdate(orderId, workflow, finalStatus) {
    try {
      return await this.a2a.requestService(
        'statusAgent',
        'updateSystemStatus',
        {
          orderId,
          workflowId: workflow.id,
          finalStatus,
          workflowSummary: this.generateWorkflowSummary(workflow),
          updateType: 'workflow_completion'
        }
      );
    } catch (error) {
      console.error(`Status update failed for ${orderId}:`, error.message);
      return {
        status: 'ERROR',
        error: error.message,
        fallback: true,
        message: 'Status update failed - workflow completed but status not updated'
      };
    }
  }

  /**
   * Determine if batch assessment is required based on compliance results
   */
  requiresBatchAssessment(complianceResult) {
    if (!complianceResult || !complianceResult.result) {
      return true; // Assess if uncertain
    }

    const result = complianceResult.result;
    const criticalKeywords = ['CRITICAL', 'BLOCKED', 'NON-COMPLIANT', 'QUARANTINE', 'HIGH RISK'];
    
    return criticalKeywords.some(keyword => 
      result.toUpperCase().includes(keyword)
    );
  }

  /**
   * Determine final status based on workflow results
   */
  determineFinalStatus(workflow) {
    const complianceStep = workflow.steps.find(s => s.name === 'compliance_validation');
    const assessmentStep = workflow.steps.find(s => s.name === 'batch_assessment');

    // If compliance failed
    if (complianceStep && complianceStep.result && 
        complianceStep.result.result && 
        complianceStep.result.result.includes('BLOCKED')) {
      return 'BLOCKED';
    }

    // If assessment was done and found issues
    if (assessmentStep && assessmentStep.status === 'completed' &&
        assessmentStep.result && assessmentStep.result.result &&
        assessmentStep.result.result.includes('BLOCK')) {
      return 'BLOCKED';
    }

    // If there were errors in any step
    const hasErrors = workflow.steps.some(step => 
      step.result && step.result.status === 'ERROR'
    );
    
    if (hasErrors) {
      return 'REVIEW_REQUIRED';
    }

    // Check for delays or warnings
    const hasWarnings = workflow.steps.some(step =>
      step.result && step.result.result && 
      (step.result.result.includes('DELAYED') || step.result.result.includes('WARNING'))
    );

    if (hasWarnings) {
      return 'DELAYED';
    }

    return 'APPROVED';
  }

  /**
   * Generate workflow summary
   */
  generateWorkflowSummary(workflow) {
    return {
      orderId: workflow.orderId,
      duration: workflow.duration,
      stepsCompleted: workflow.steps.filter(s => s.status === 'completed').length,
      stepsSkipped: workflow.steps.filter(s => s.status === 'skipped').length,
      stepsFailed: workflow.steps.filter(s => s.status === 'failed').length,
      finalStatus: workflow.finalStatus,
      keyFindings: this.extractKeyFindings(workflow),
      recommendations: this.generateRecommendations(workflow)
    };
  }

  /**
   * Extract key findings from workflow steps
   */
  extractKeyFindings(workflow) {
    const findings = [];
    
    workflow.steps.forEach(step => {
      if (step.result && step.result.result) {
        if (step.result.result.includes('CRITICAL')) {
          findings.push(`${step.name}: Critical issue detected`);
        }
        if (step.result.result.includes('QUARANTINE')) {
          findings.push(`${step.name}: Quarantine status identified`);
        }
        if (step.result.result.includes('COMPLIANCE')) {
          findings.push(`${step.name}: Compliance validation completed`);
        }
      }
    });

    return findings;
  }

  /**
   * Generate recommendations based on workflow results
   */
  generateRecommendations(workflow) {
    const recommendations = [];
    
    if (workflow.finalStatus === 'BLOCKED') {
      recommendations.push('Immediate escalation to QA Manager required');
      recommendations.push('Production hold until issues resolved');
    }
    
    if (workflow.finalStatus === 'DELAYED') {
      recommendations.push('Schedule review meeting with production planning');
      recommendations.push('Customer notification may be required');
    }

    if (workflow.finalStatus === 'APPROVED') {
      recommendations.push('Production release approved');
      recommendations.push('Monitor for any late-breaking issues');
    }

    return recommendations;
  }

  /**
   * Update average duration statistics
   */
  updateAverageDuration(duration) {
    if (this.workflowStats.completed === 1) {
      this.workflowStats.avgDuration = duration;
    } else {
      this.workflowStats.avgDuration = 
        (this.workflowStats.avgDuration * (this.workflowStats.completed - 1) + duration) / 
        this.workflowStats.completed;
    }
  }

  /**
   * Get workflow statistics
   */
  getWorkflowStats() {
    return {
      ...this.workflowStats,
      activeWorkflows: this.activeWorkflows.size,
      successRate: this.workflowStats.total > 0 ? 
        Math.round((this.workflowStats.completed / this.workflowStats.total) * 100) : 100,
      avgDurationSeconds: Math.round(this.workflowStats.avgDuration / 1000),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get active workflows
   */
  getActiveWorkflows() {
    return Array.from(this.activeWorkflows.values()).map(workflow => ({
      id: workflow.id,
      orderId: workflow.orderId,
      status: workflow.status,
      currentStep: workflow.currentStep,
      totalSteps: workflow.totalSteps,
      duration: Date.now() - workflow.startTime,
      startTime: workflow.startTime
    }));
  }

  /**
   * Cancel active workflow
   */
  cancelWorkflow(workflowId, reason = 'User requested') {
    const workflow = this.activeWorkflows.get(workflowId);
    if (workflow) {
      workflow.status = 'cancelled';
      workflow.cancelReason = reason;
      workflow.duration = Date.now() - workflow.startTime;
      
      this.activeWorkflows.delete(workflowId);
      console.log(`🚫 Workflow ${workflowId} cancelled: ${reason}`);
      
      return true;
    }
    return false;
  }
}

export default ProductionWorkflow;