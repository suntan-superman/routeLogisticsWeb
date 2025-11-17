import React, { useState, useEffect, useCallback } from 'react';
import { useCompany } from '../contexts/CompanyContext';
import InvoiceTemplateService from '../services/invoiceTemplateService';
import {
  DocumentTextIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  StarIcon,
  CheckCircleIcon,
  XCircleIcon,
  EyeIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const InvoiceTemplatesPage = () => {
  const { getEffectiveCompanyId } = useCompany();
  const [templates, setTemplates] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateForm, setTemplateForm] = useState({
    name: '',
    layout: 'classic',
    colors: {
      primary: '#10b981',
      secondary: '#6b7280',
      accent: '#059669'
    },
    fonts: {
      heading: 'helvetica',
      body: 'helvetica'
    },
    logoPosition: 'left',
    headerStyle: 'standard',
    footerText: '',
    showBorder: true,
    borderColor: '#e5e7eb',
    isDefault: false
  });

  const loadTemplates = useCallback(async () => {
    const companyId = getEffectiveCompanyId();
    if (!companyId) return;

    setIsLoading(true);
    try {
      const result = await InvoiceTemplateService.getTemplates(companyId);
      if (result.success) {
        setTemplates(result.templates);
      } else {
        toast.error(result.error || 'Failed to load templates');
      }
    } catch (error) {
      console.error('Error loading templates:', error);
      toast.error('Error loading templates');
    }
    setIsLoading(false);
  }, [getEffectiveCompanyId]);

  useEffect(() => {
    loadTemplates();
  }, [loadTemplates]);

  const handleCreateFromPredefined = async (templateKey) => {
    const companyId = getEffectiveCompanyId();
    if (!companyId) {
      toast.error('Company ID is required');
      return;
    }

    const predefined = InvoiceTemplateService.getPredefinedTemplates();
    const template = predefined[templateKey];
    
    if (!template) {
      toast.error('Template not found');
      return;
    }

    setIsLoading(true);
    try {
      const result = await InvoiceTemplateService.createTemplate({
        companyId,
        name: template.name,
        ...template,
        isDefault: templates.length === 0 // Set as default if first template
      });

      if (result.success) {
        await loadTemplates();
        toast.success(`Template "${template.name}" created successfully!`);
        setShowCreateModal(false);
      } else {
        toast.error(result.error || 'Failed to create template');
      }
    } catch (error) {
      console.error('Error creating template:', error);
      toast.error('Error creating template');
    }
    setIsLoading(false);
  };

  const handleCreateCustom = async () => {
    const companyId = getEffectiveCompanyId();
    if (!companyId) {
      toast.error('Company ID is required');
      return;
    }

    if (!templateForm.name.trim()) {
      toast.error('Template name is required');
      return;
    }

    setIsLoading(true);
    try {
      const result = await InvoiceTemplateService.createTemplate({
        companyId,
        ...templateForm
      });

      if (result.success) {
        await loadTemplates();
        toast.success('Template created successfully!');
        setShowCreateModal(false);
        resetForm();
      } else {
        toast.error(result.error || 'Failed to create template');
      }
    } catch (error) {
      console.error('Error creating template:', error);
      toast.error('Error creating template');
    }
    setIsLoading(false);
  };

  const handleUpdateTemplate = async () => {
    if (!selectedTemplate) return;

    setIsLoading(true);
    try {
      const result = await InvoiceTemplateService.updateTemplate(
        selectedTemplate.id,
        templateForm
      );

      if (result.success) {
        await loadTemplates();
        toast.success('Template updated successfully!');
        setShowEditModal(false);
        setSelectedTemplate(null);
        resetForm();
      } else {
        toast.error(result.error || 'Failed to update template');
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
      const result = await InvoiceTemplateService.deleteTemplate(templateId);
      if (result.success) {
        await loadTemplates();
        toast.success('Template deleted successfully!');
      } else {
        toast.error(result.error || 'Failed to delete template');
      }
    } catch (error) {
      console.error('Error deleting template:', error);
      toast.error('Error deleting template');
    }
    setIsLoading(false);
  };

  const handleSetDefault = async (templateId) => {
    setIsLoading(true);
    try {
      const result = await InvoiceTemplateService.updateTemplate(templateId, {
        isDefault: true
      });

      if (result.success) {
        await loadTemplates();
        toast.success('Default template updated!');
      } else {
        toast.error(result.error || 'Failed to set default template');
      }
    } catch (error) {
      console.error('Error setting default template:', error);
      toast.error('Error setting default template');
    }
    setIsLoading(false);
  };

  const handleEditTemplate = (template) => {
    setSelectedTemplate(template);
    setTemplateForm({
      name: template.name || '',
      layout: template.layout || 'classic',
      colors: template.colors || {
        primary: '#10b981',
        secondary: '#6b7280',
        accent: '#059669'
      },
      fonts: template.fonts || {
        heading: 'helvetica',
        body: 'helvetica'
      },
      logoPosition: template.logoPosition || 'left',
      headerStyle: template.headerStyle || 'standard',
      footerText: template.footerText || '',
      showBorder: template.showBorder !== undefined ? template.showBorder : true,
      borderColor: template.borderColor || '#e5e7eb',
      isDefault: template.isDefault || false
    });
    setShowEditModal(true);
  };

  const resetForm = () => {
    setTemplateForm({
      name: '',
      layout: 'classic',
      colors: {
        primary: '#10b981',
        secondary: '#6b7280',
        accent: '#059669'
      },
      fonts: {
        heading: 'helvetica',
        body: 'helvetica'
      },
      logoPosition: 'left',
      headerStyle: 'standard',
      footerText: '',
      showBorder: true,
      borderColor: '#e5e7eb',
      isDefault: false
    });
  };

  const predefinedTemplates = InvoiceTemplateService.getPredefinedTemplates();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Invoice Templates</h1>
            <p className="mt-2 text-sm text-gray-600">
              Manage invoice templates to customize the look and feel of your invoices
            </p>
          </div>
          <button
            onClick={() => {
              resetForm();
              setShowCreateModal(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <PlusIcon className="w-5 h-5" />
            Create Template
          </button>
        </div>

        {/* Templates Grid */}
        {isLoading && templates.length === 0 ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
            <p className="mt-4 text-gray-600">Loading templates...</p>
          </div>
        ) : templates.length === 0 ? (
          <div className="bg-white rounded-lg border-2 border-dashed border-gray-300 p-12 text-center">
            <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">No templates yet</h3>
            <p className="mt-2 text-sm text-gray-500">
              Get started by creating a template from a predefined design or create your own custom template.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-6 inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <PlusIcon className="w-5 h-5" />
              Create Your First Template
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templates.map((template) => (
              <div
                key={template.id}
                className="bg-white rounded-lg border border-gray-200 shadow-sm hover:shadow-md transition-shadow overflow-hidden"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        {template.name}
                        {template.isDefault && (
                          <StarIcon className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                        )}
                      </h3>
                      <p className="text-sm text-gray-500 mt-1 capitalize">
                        {template.layout} • {template.headerStyle}
                      </p>
                    </div>
                  </div>

                  {/* Color Preview */}
                  <div className="flex gap-2 mb-4">
                    <div
                      className="w-8 h-8 rounded"
                      style={{ backgroundColor: template.colors?.primary || '#10b981' }}
                      title="Primary Color"
                    />
                    <div
                      className="w-8 h-8 rounded"
                      style={{ backgroundColor: template.colors?.secondary || '#6b7280' }}
                      title="Secondary Color"
                    />
                    <div
                      className="w-8 h-8 rounded"
                      style={{ backgroundColor: template.colors?.accent || '#059669' }}
                      title="Accent Color"
                    />
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    {!template.isDefault && (
                      <button
                        onClick={() => handleSetDefault(template.id)}
                        className="flex-1 px-3 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                        title="Set as default"
                      >
                        <StarIcon className="w-4 h-4 inline mr-1" />
                        Set Default
                      </button>
                    )}
                    <button
                      onClick={() => handleEditTemplate(template)}
                      className="px-3 py-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                      title="Edit template"
                    >
                      <PencilIcon className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDeleteTemplate(template.id)}
                      className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete template"
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Predefined Templates Section */}
        {templates.length > 0 && (
          <div className="mt-12">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Predefined Templates</h2>
            <p className="text-sm text-gray-600 mb-6">
              Quick-start templates you can use as a base for your custom designs
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.entries(predefinedTemplates).map(([key, template]) => (
                <button
                  key={key}
                  onClick={() => handleCreateFromPredefined(key)}
                  disabled={isLoading}
                  className="bg-white rounded-lg border-2 border-dashed border-gray-300 p-6 hover:border-green-500 hover:bg-green-50 transition-all text-left disabled:opacity-50"
                >
                  <h3 className="font-semibold text-gray-900 mb-2">{template.name}</h3>
                  <div className="flex gap-2 mb-3">
                    <div
                      className="w-6 h-6 rounded"
                      style={{ backgroundColor: template.colors.primary }}
                    />
                    <div
                      className="w-6 h-6 rounded"
                      style={{ backgroundColor: template.colors.secondary }}
                    />
                    <div
                      className="w-6 h-6 rounded"
                      style={{ backgroundColor: template.colors.accent }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 capitalize">
                    {template.layout} layout
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <TemplateModal
          title="Create Template"
          templateForm={templateForm}
          setTemplateForm={setTemplateForm}
          onSave={handleCreateCustom}
          onCancel={() => {
            setShowCreateModal(false);
            resetForm();
          }}
          isLoading={isLoading}
          predefinedTemplates={predefinedTemplates}
          onCreateFromPredefined={handleCreateFromPredefined}
        />
      )}

      {/* Edit Modal */}
      {showEditModal && selectedTemplate && (
        <TemplateModal
          title="Edit Template"
          templateForm={templateForm}
          setTemplateForm={setTemplateForm}
          onSave={handleUpdateTemplate}
          onCancel={() => {
            setShowEditModal(false);
            setSelectedTemplate(null);
            resetForm();
          }}
          isLoading={isLoading}
        />
      )}
    </div>
  );
};

// Template Form Modal Component
const TemplateModal = ({
  title,
  templateForm,
  setTemplateForm,
  onSave,
  onCancel,
  isLoading,
  predefinedTemplates,
  onCreateFromPredefined
}) => {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" onClick={onCancel}></div>
        
        <div className="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-3xl sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-medium text-gray-900">{title}</h3>
              <button
                onClick={onCancel}
                className="text-gray-400 hover:text-gray-500"
              >
                <XCircleIcon className="h-6 w-6" />
              </button>
            </div>

            {/* Predefined Templates Quick Add */}
            {predefinedTemplates && onCreateFromPredefined && (
              <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium text-gray-700 mb-3">Quick Start:</p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(predefinedTemplates).map(([key, template]) => (
                    <button
                      key={key}
                      onClick={() => onCreateFromPredefined(key)}
                      disabled={isLoading}
                      className="px-3 py-2 text-sm text-left bg-white border border-gray-300 rounded-lg hover:border-green-500 hover:bg-green-50 transition-colors disabled:opacity-50"
                    >
                      {template.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-6">
              {/* Basic Info */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Template Name *
                </label>
                <input
                  type="text"
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  placeholder="e.g., My Custom Template"
                />
              </div>

              {/* Layout & Style */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Layout
                  </label>
                  <select
                    value={templateForm.layout}
                    onChange={(e) => setTemplateForm(prev => ({ ...prev, layout: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  >
                    <option value="classic">Classic</option>
                    <option value="modern">Modern</option>
                    <option value="professional">Professional</option>
                    <option value="creative">Creative</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Header Style
                  </label>
                  <select
                    value={templateForm.headerStyle}
                    onChange={(e) => setTemplateForm(prev => ({ ...prev, headerStyle: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  >
                    <option value="standard">Standard</option>
                    <option value="minimal">Minimal</option>
                    <option value="bold">Bold</option>
                    <option value="formal">Formal</option>
                  </select>
                </div>
              </div>

              {/* Colors */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  Colors
                </label>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Primary</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={templateForm.colors.primary}
                        onChange={(e) => setTemplateForm(prev => ({
                          ...prev,
                          colors: { ...prev.colors, primary: e.target.value }
                        }))}
                        className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
                      />
                      <input
                        type="text"
                        value={templateForm.colors.primary}
                        onChange={(e) => setTemplateForm(prev => ({
                          ...prev,
                          colors: { ...prev.colors, primary: e.target.value }
                        }))}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        placeholder="#10b981"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Secondary</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={templateForm.colors.secondary}
                        onChange={(e) => setTemplateForm(prev => ({
                          ...prev,
                          colors: { ...prev.colors, secondary: e.target.value }
                        }))}
                        className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
                      />
                      <input
                        type="text"
                        value={templateForm.colors.secondary}
                        onChange={(e) => setTemplateForm(prev => ({
                          ...prev,
                          colors: { ...prev.colors, secondary: e.target.value }
                        }))}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        placeholder="#6b7280"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Accent</label>
                    <div className="flex gap-2">
                      <input
                        type="color"
                        value={templateForm.colors.accent}
                        onChange={(e) => setTemplateForm(prev => ({
                          ...prev,
                          colors: { ...prev.colors, accent: e.target.value }
                        }))}
                        className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
                      />
                      <input
                        type="text"
                        value={templateForm.colors.accent}
                        onChange={(e) => setTemplateForm(prev => ({
                          ...prev,
                          colors: { ...prev.colors, accent: e.target.value }
                        }))}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        placeholder="#059669"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Logo Position */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Logo Position
                </label>
                <select
                  value={templateForm.logoPosition}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, logoPosition: e.target.value }))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                >
                  <option value="left">Left</option>
                  <option value="center">Center</option>
                  <option value="right">Right</option>
                </select>
              </div>

              {/* Border */}
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={templateForm.showBorder}
                    onChange={(e) => setTemplateForm(prev => ({ ...prev, showBorder: e.target.checked }))}
                    className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                  />
                  <span className="text-sm font-medium text-gray-700">Show Border</span>
                </label>
                {templateForm.showBorder && (
                  <div className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={templateForm.borderColor}
                      onChange={(e) => setTemplateForm(prev => ({ ...prev, borderColor: e.target.value }))}
                      className="w-10 h-10 border border-gray-300 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={templateForm.borderColor}
                      onChange={(e) => setTemplateForm(prev => ({ ...prev, borderColor: e.target.value }))}
                      className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
                      placeholder="#e5e7eb"
                    />
                  </div>
                )}
              </div>

              {/* Footer Text */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Footer Text (Optional)
                </label>
                <textarea
                  value={templateForm.footerText}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, footerText: e.target.value }))}
                  rows={2}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  placeholder="Custom footer text that appears at the bottom of invoices..."
                />
              </div>

              {/* Set as Default */}
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={templateForm.isDefault}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, isDefault: e.target.checked }))}
                  className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                />
                <label className="text-sm font-medium text-gray-700">
                  Set as default template
                </label>
              </div>
            </div>
          </div>
          
          <div className="bg-gray-50 px-4 py-3 sm:px-6 sm:flex sm:flex-row-reverse">
            <button
              onClick={onSave}
              disabled={isLoading || !templateForm.name.trim()}
              className="w-full inline-flex justify-center rounded-md border border-transparent shadow-sm px-4 py-2 bg-green-600 text-base font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 sm:ml-3 sm:w-auto sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Saving...' : 'Save Template'}
            </button>
            <button
              onClick={onCancel}
              className="mt-3 w-full inline-flex justify-center rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-base font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 sm:mt-0 sm:ml-3 sm:w-auto sm:text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InvoiceTemplatesPage;

