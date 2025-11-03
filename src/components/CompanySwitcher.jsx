import React, { useState } from 'react';
import { useCompany } from '../contexts/CompanyContext';
import { ChevronDownIcon, CheckIcon } from '@heroicons/react/24/outline';

const CompanySwitcher = () => {
  const { availableCompanies, activeCompany, switchCompany, canSwitchCompanies } = useCompany();
  const [isOpen, setIsOpen] = useState(false);

  // Always show current company prominently, even if can't switch
  if (!activeCompany) {
    return null;
  }

  const handleSwitch = async (companyId) => {
    try {
      await switchCompany(companyId);
      setIsOpen(false);
    } catch (error) {
      console.error('Error switching company:', error);
    }
  };

  return (
    <div className="relative">
      {canSwitchCompanies && availableCompanies.length > 1 ? (
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-900 bg-primary-50 border-2 border-primary-300 rounded-md hover:bg-primary-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 shadow-sm"
        >
          <span className="max-w-[200px] truncate font-bold">
            {activeCompany?.name || 'Select Company'}
          </span>
          <ChevronDownIcon className="h-4 w-4 text-primary-600" />
        </button>
      ) : (
        <div className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-gray-900 bg-primary-50 border-2 border-primary-300 rounded-md shadow-sm">
          <span className="max-w-[200px] truncate font-bold">
            {activeCompany?.name || 'Company'}
          </span>
        </div>
      )}

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 z-20 mt-2 w-64 bg-white rounded-md shadow-lg ring-1 ring-black ring-opacity-5">
            <div className="py-1">
              <div className="px-4 py-2 text-xs font-semibold text-gray-500 uppercase bg-gray-50">
                Switch Company
              </div>
              {availableCompanies.map((company) => (
                <button
                  key={company.id}
                  onClick={() => handleSwitch(company.id)}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center justify-between ${
                    activeCompany?.id === company.id ? 'bg-primary-50 text-primary-700' : 'text-gray-700'
                  }`}
                >
                  <span className="truncate">{company.name}</span>
                  {activeCompany?.id === company.id && (
                    <CheckIcon className="h-4 w-4 text-primary-600" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default CompanySwitcher;

