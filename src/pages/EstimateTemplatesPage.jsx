import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import EstimateTemplateService from '../services/estimateTemplateService';
import { 
  DocumentTextIcon, 
  PlusIcon,
  PencilIcon,
  TrashIcon,
  EyeIcon,
  DocumentDuplicateIcon,
  ChartBarIcon,
  CogIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const EstimateTemplatesPage = () => {
  const [templates, setTemplates] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [stats, setStats] = useState({
    totalTemplates: 0,
    activeTemplates: 0,
    inactiveTemplates: 0,
    totalUsage: 0,
    mostUsedTemplate: null
  });

  // Form states
  const [templateData, setTemplateData] = useState({
    name: '',
    description: '',
    serviceType: '',
    scopeOfWork: '',
    materials: '',
    laborHours: '',
    laborRate: '',
    materialCost: '',
    totalCost: '',
    notes: '',
    terms: '',
    validityDays: 30,
    isActive: true
  });

  useEffect(() => {
    loadTemplates();
    loadStats();
  }, []);

  const loadTemplates = async () => {
    setIsLoading(true);
    try {
      const result = await EstimateTemplateService.getTemplates();
      if (result.success) {
        setTemplates(result.templates);
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error loading templates:', error);
      toast.error('Error loading templates');
    }
    setIsLoading(false);
  };

  const loadStats = async () => {
    try {
      const result = await EstimateTemplateService.getTemplateStats();
      if (result.success) {
        setStats(result.stats);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const handleInputChange = (field, value) => {
    setTemplateData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const resetForm = () => {
    setTemplateData({
      name: '',
      description: '',
      serviceType: '',
      scopeOfWork: '',
      materials: '',
      laborHours: '',
      laborRate: '',
      materialCost: '',
      totalCost: '',
      notes: '',
      terms: '',
      validityDays: 30,
      isActive: true
    });
  };

  const handleAddTemplate = async () => {
    if (!templateData.name.trim()) {
      toast.error('Template name is required');
      return;
    }

    setIsLoading(true);
    try {
      const result = await EstimateTemplateService.createTemplate(templateData);
      if (result.success) {
        setTemplates(prev => [result.template, ...prev]);
        setShowAddModal(false);
        resetForm();
        loadStats();
        toast.success('Template created successfully!');
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error adding template:', error);
      toast.error('Error adding template');
    }
    setIsLoading(false);
  };

  const handleEditTemplate = async () => {
    if (!templateData.name.trim()) {
      toast.error('Template name is required');
      return;
    }

    setIsLoading(true);
    try {
      const result = await EstimateTemplateService.updateTemplate(selectedTemplate.id, templateData);
      if (result.success) {
        setTemplates(prev => prev.map(template => 
          template.id === selectedTemplate.id ? result.template : template
        ));
        setShowEditModal(false);
        setSelectedTemplate(null);
        resetForm();
        loadStats();
        toast.success('Template updated successfully!');
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error updating template:', error);
      toast.error('Error updating template');
    }
    setIsLoading(false);
  };

  const handleDeleteTemplate = async (templateId) => {
    if (!window.confirm('Are you sure you want to delete this template?')) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await EstimateTemplateService.deleteTemplate(templateId);
      if (result.success) {
        setTemplates(prev => prev.filter(template => template.id !== templateId));
        loadStats();
        toast.success('Template deleted successfully!');
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error deleting template:', error);
      toast.error('Error deleting template');
    }
    setIsLoading(false);
  };

  const handleDuplicateTemplate = async () => {
    setIsLoading(true);
    try {
      const result = await EstimateTemplateService.duplicateTemplate(selectedTemplate.id);
      if (result.success) {
        setTemplates(prev => [result.template, ...prev]);
        setShowDuplicateModal(false);
        setSelectedTemplate(null);
        loadStats();
        toast.success('Template duplicated successfully!');
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error duplicating template:', error);
      toast.error('Error duplicating template');
    }
    setIsLoading(false);
  };

  const createDefaultTemplates = async () => {
    setIsLoading(true);
    try {
      const result = await EstimateTemplateService.createDefaultTemplates();
      if (result.success) {
        if (result.templates) {
          setTemplates(prev => [...result.templates, ...prev]);
          loadStats();
          toast.success('Default templates created successfully!');
        } else {
          toast.info('You already have templates');
        }
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error('Error creating default templates:', error);
      toast.error('Error creating default templates');
    }
    setIsLoading(false);
  };

  const openEditModal = (template) => {
    setSelectedTemplate(template);
    setTemplateData({
      name: template.name || '',
      description: template.description || '',
      serviceType: template.serviceType || '',
      scopeOfWork: template.scopeOfWork || '',
      materials: template.materials || '',
      laborHours: template.laborHours || '',
      laborRate: template.laborRate || '',
      materialCost: template.materialCost || '',
      totalCost: template.totalCost || '',
      notes: template.notes || '',
      terms: template.terms || '',
      validityDays: template.validityDays || 30,
      isActive: template.isActive
    });
    setShowEditModal(true);
  };

  const openViewModal = (template) => {
    setSelectedTemplate(template);
    setShowViewModal(true);
  };

  const openDuplicateModal = (template) => {
    setSelectedTemplate(template);
    setShowDuplicateModal(true);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <DocumentTextIcon className="h-8 w-8 text-primary-500 mr-3" />
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Estimate Templates</h1>
              <p className="text-gray-600">Create and manage professional estimate templates</p>
            </div>
          </div>
          <div className="flex space-x-3">
            {templates.length === 0 && (
              <button
                onClick={createDefaultTemplates}
                className="flex items-center px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                <CogIcon className="h-4 w-4 mr-2" />
                Create Defaults
              </button>
            )}
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <PlusIcon className="h-4 w-4 mr-2" />
              New Template
            </button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <DocumentTextIcon className="h-6 w-6 text-primary-500" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Templates</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.totalTemplates}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-6 w-6 bg-green-500 rounded-full"></div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Active Templates</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.activeTemplates}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <ChartBarIcon className="h-6 w-6 text-purple-500" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Usage</dt>
                  <dd className="text-lg font-medium text-gray-900">{stats.totalUsage}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="h-6 w-6 bg-orange-500 rounded-full"></div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Most Used</dt>
                  <dd className="text-lg font-medium text-gray-900">
                    {stats.mostUsedTemplate ? stats.mostUsedTemplate.usageCount : 0}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Templates Grid */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            Templates ({templates.length})
          </h3>
        </div>
        
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
          </div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12">
            <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No templates yet</h3>
            <p className="mt-1 text-sm text-gray-500">
              Get started by creating your first estimate template or adding default templates.
            </p>
            <div className="mt-6 flex justify-center space-x-3">
              <button
                onClick={createDefaultTemplates}
                className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                <CogIcon className="h-4 w-4 mr-2" />
                Create Defaults
              </button>
              <button
                onClick={() => setShowAddModal(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                Create Template
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {templates.map((template) => (
                <div key={template.id} className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow duration-200">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="text-lg font-medium text-gray-900 mb-2">{template.name}</h4>
                      <p className="text-sm text-gray-600 mb-3">{template.description}</p>
                      
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Service Type:</span>
                          <span className="text-gray-900">{template.serviceType}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Labor Hours:</span>
                          <span className="text-gray-900">{template.laborHours}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Total Cost:</span>
                          <span className="text-gray-900 font-medium">{formatCurrency(template.totalCost)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Usage Count:</span>
                          <span className="text-gray-900">{template.usageCount || 0}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-col space-y-2 ml-4">
                      <button
                        onClick={() => openViewModal(template)}
                        className="text-primary-600 hover:text-primary-900"
                        title="View Template"
                      >
                        <EyeIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => openEditModal(template)}
                        className="text-gray-600 hover:text-gray-900"
                        title="Edit Template"
                      >
                        <PencilIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => openDuplicateModal(template)}
                        className="text-blue-600 hover:text-blue-900"
                        title="Duplicate Template"
                      >
                        <DocumentDuplicateIcon className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteTemplate(template.id)}
                        className="text-red-600 hover:text-red-900"
                        title="Delete Template"
                      >
                        <TrashIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>Created {formatDate(template.createdAt)}</span>
                      <span className={`px-2 py-1 rounded-full ${
                        template.isActive 
                          ? 'bg-green-100 text-green-800' 
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {template.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add Template Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-10 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Create New Template</h3>
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="sr-only">Close</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="space-y-4 max-h-96 overflow-y-auto">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Template Name *</label>
                    <input
                      type="text"
                      value={templateData.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                      placeholder="e.g., Pool Maintenance"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Service Type</label>
                    <input
                      type="text"
                      value={templateData.serviceType}
                      onChange={(e) => handleInputChange('serviceType', e.target.value)}
                      className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                      placeholder="e.g., Pool Maintenance"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Description</label>
                  <textarea
                    value={templateData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    rows={2}
                    className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                    placeholder="Brief description of the service..."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Scope of Work</label>
                  <textarea
                    value={templateData.scopeOfWork}
                    onChange={(e) => handleInputChange('scopeOfWork', e.target.value)}
                    rows={4}
                    className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                    placeholder="• Service item 1\n• Service item 2\n• Service item 3"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Materials</label>
                  <textarea
                    value={templateData.materials}
                    onChange={(e) => handleInputChange('materials', e.target.value)}
                    rows={3}
                    className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                    placeholder="• Material 1\n• Material 2\n• Material 3"
                  />
                </div>
                
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Labor Hours</label>
                    <input
                      type="number"
                      step="0.5"
                      value={templateData.laborHours}
                      onChange={(e) => handleInputChange('laborHours', e.target.value)}
                      className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                      placeholder="2.5"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Labor Rate ($/hr)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={templateData.laborRate}
                      onChange={(e) => handleInputChange('laborRate', e.target.value)}
                      className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                      placeholder="75.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Material Cost</label>
                    <input
                      type="number"
                      step="0.01"
                      value={templateData.materialCost}
                      onChange={(e) => handleInputChange('materialCost', e.target.value)}
                      className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                      placeholder="150.00"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Total Cost</label>
                  <input
                    type="number"
                    step="0.01"
                    value={templateData.totalCost}
                    onChange={(e) => handleInputChange('totalCost', e.target.value)}
                    className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                    placeholder="300.00"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Notes</label>
                  <textarea
                    value={templateData.notes}
                    onChange={(e) => handleInputChange('notes', e.target.value)}
                    rows={3}
                    className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                    placeholder="Additional notes or special instructions..."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Terms & Conditions</label>
                  <textarea
                    value={templateData.terms}
                    onChange={(e) => handleInputChange('terms', e.target.value)}
                    rows={2}
                    className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                    placeholder="Payment terms, warranty information, etc."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Validity Days</label>
                  <input
                    type="number"
                    value={templateData.validityDays}
                    onChange={(e) => handleInputChange('validityDays', e.target.value)}
                    className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                    placeholder="30"
                  />
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddTemplate}
                  disabled={isLoading}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Creating...' : 'Create Template'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Template Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-10 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Edit Template</h3>
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedTemplate(null);
                    resetForm();
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="sr-only">Close</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="space-y-4 max-h-96 overflow-y-auto">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Template Name *</label>
                    <input
                      type="text"
                      value={templateData.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                      placeholder="e.g., Pool Maintenance"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Service Type</label>
                    <input
                      type="text"
                      value={templateData.serviceType}
                      onChange={(e) => handleInputChange('serviceType', e.target.value)}
                      className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                      placeholder="e.g., Pool Maintenance"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Description</label>
                  <textarea
                    value={templateData.description}
                    onChange={(e) => handleInputChange('description', e.target.value)}
                    rows={2}
                    className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                    placeholder="Brief description of the service..."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Scope of Work</label>
                  <textarea
                    value={templateData.scopeOfWork}
                    onChange={(e) => handleInputChange('scopeOfWork', e.target.value)}
                    rows={4}
                    className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                    placeholder="• Service item 1\n• Service item 2\n• Service item 3"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Materials</label>
                  <textarea
                    value={templateData.materials}
                    onChange={(e) => handleInputChange('materials', e.target.value)}
                    rows={3}
                    className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                    placeholder="• Material 1\n• Material 2\n• Material 3"
                  />
                </div>
                
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Labor Hours</label>
                    <input
                      type="number"
                      step="0.5"
                      value={templateData.laborHours}
                      onChange={(e) => handleInputChange('laborHours', e.target.value)}
                      className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                      placeholder="2.5"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Labor Rate ($/hr)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={templateData.laborRate}
                      onChange={(e) => handleInputChange('laborRate', e.target.value)}
                      className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                      placeholder="75.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Material Cost</label>
                    <input
                      type="number"
                      step="0.01"
                      value={templateData.materialCost}
                      onChange={(e) => handleInputChange('materialCost', e.target.value)}
                      className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                      placeholder="150.00"
                    />
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Total Cost</label>
                  <input
                    type="number"
                    step="0.01"
                    value={templateData.totalCost}
                    onChange={(e) => handleInputChange('totalCost', e.target.value)}
                    className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                    placeholder="300.00"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Notes</label>
                  <textarea
                    value={templateData.notes}
                    onChange={(e) => handleInputChange('notes', e.target.value)}
                    rows={3}
                    className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                    placeholder="Additional notes or special instructions..."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Terms & Conditions</label>
                  <textarea
                    value={templateData.terms}
                    onChange={(e) => handleInputChange('terms', e.target.value)}
                    rows={2}
                    className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                    placeholder="Payment terms, warranty information, etc."
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700">Validity Days</label>
                  <input
                    type="number"
                    value={templateData.validityDays}
                    onChange={(e) => handleInputChange('validityDays', e.target.value)}
                    className="mt-1 block w-full px-4 py-2.5 rounded-lg border border-gray-300 shadow-sm focus:border-primary-500 focus:ring-2 focus:ring-primary-500 focus:ring-opacity-50 transition-colors sm:text-sm"
                    placeholder="30"
                  />
                </div>
                
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={templateData.isActive}
                    onChange={(e) => handleInputChange('isActive', e.target.checked)}
                    className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                  />
                  <label htmlFor="isActive" className="ml-2 block text-sm text-gray-900">
                    Active template
                  </label>
                </div>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowEditModal(false);
                    setSelectedTemplate(null);
                    resetForm();
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEditTemplate}
                  disabled={isLoading}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* View Template Modal */}
      {showViewModal && selectedTemplate && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-10 mx-auto p-5 border w-full max-w-2xl shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Template Details</h3>
                <button
                  onClick={() => {
                    setShowViewModal(false);
                    setSelectedTemplate(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="sr-only">Close</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="space-y-4 max-h-96 overflow-y-auto">
                <div className="border-b pb-4">
                  <h4 className="text-xl font-medium text-gray-900">{selectedTemplate.name}</h4>
                  <p className="text-sm text-gray-600 mt-1">{selectedTemplate.description}</p>
                  <div className="flex items-center space-x-4 mt-2 text-sm text-gray-500">
                    <span>Created {formatDate(selectedTemplate.createdAt)}</span>
                    <span>Used {selectedTemplate.usageCount || 0} times</span>
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      selectedTemplate.isActive 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {selectedTemplate.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <h5 className="text-sm font-medium text-gray-700">Service Type</h5>
                    <p className="text-sm text-gray-900">{selectedTemplate.serviceType || 'Not specified'}</p>
                  </div>
                  <div>
                    <h5 className="text-sm font-medium text-gray-700">Validity</h5>
                    <p className="text-sm text-gray-900">{selectedTemplate.validityDays || 30} days</p>
                  </div>
                </div>
                
                <div>
                  <h5 className="text-sm font-medium text-gray-700">Scope of Work</h5>
                  <div className="text-sm text-gray-900 whitespace-pre-line">
                    {selectedTemplate.scopeOfWork || 'Not specified'}
                  </div>
                </div>
                
                <div>
                  <h5 className="text-sm font-medium text-gray-700">Materials</h5>
                  <div className="text-sm text-gray-900 whitespace-pre-line">
                    {selectedTemplate.materials || 'Not specified'}
                  </div>
                </div>
                
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <h5 className="text-sm font-medium text-gray-700">Labor Hours</h5>
                    <p className="text-sm text-gray-900">{selectedTemplate.laborHours || 'Not specified'}</p>
                  </div>
                  <div>
                    <h5 className="text-sm font-medium text-gray-700">Labor Rate</h5>
                    <p className="text-sm text-gray-900">{formatCurrency(selectedTemplate.laborRate)}</p>
                  </div>
                  <div>
                    <h5 className="text-sm font-medium text-gray-700">Material Cost</h5>
                    <p className="text-sm text-gray-900">{formatCurrency(selectedTemplate.materialCost)}</p>
                  </div>
                </div>
                
                <div className="bg-gray-50 p-4 rounded-md">
                  <h5 className="text-sm font-medium text-gray-700 mb-2">Total Cost</h5>
                  <p className="text-lg font-semibold text-gray-900">{formatCurrency(selectedTemplate.totalCost)}</p>
                </div>
                
                {selectedTemplate.notes && (
                  <div>
                    <h5 className="text-sm font-medium text-gray-700">Notes</h5>
                    <div className="text-sm text-gray-900 whitespace-pre-line">
                      {selectedTemplate.notes}
                    </div>
                  </div>
                )}
                
                {selectedTemplate.terms && (
                  <div>
                    <h5 className="text-sm font-medium text-gray-700">Terms & Conditions</h5>
                    <div className="text-sm text-gray-900 whitespace-pre-line">
                      {selectedTemplate.terms}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowViewModal(false);
                    setSelectedTemplate(null);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    setShowViewModal(false);
                    openEditModal(selectedTemplate);
                  }}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                >
                  Edit Template
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Duplicate Template Modal */}
      {showDuplicateModal && selectedTemplate && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
          <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
            <div className="mt-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">Duplicate Template</h3>
                <button
                  onClick={() => {
                    setShowDuplicateModal(false);
                    setSelectedTemplate(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="sr-only">Close</span>
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  Are you sure you want to duplicate "{selectedTemplate.name}"? 
                  This will create a copy of the template with "(Copy)" added to the name.
                </p>
              </div>
              
              <div className="flex justify-end space-x-3 mt-6">
                <button
                  onClick={() => {
                    setShowDuplicateModal(false);
                    setSelectedTemplate(null);
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDuplicateTemplate}
                  disabled={isLoading}
                  className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? 'Duplicating...' : 'Duplicate'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};

export default EstimateTemplatesPage;
