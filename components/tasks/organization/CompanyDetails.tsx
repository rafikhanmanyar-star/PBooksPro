import React, { useState } from 'react';
import { ICONS } from '../../../constants';

const CompanyDetails: React.FC = () => {
    const [isEditing, setIsEditing] = useState(false);

    // Mock Data
    const [formData, setFormData] = useState({
        name: 'Acme Corp',
        domain: 'acme.com',
        headquarters: 'San Francisco, CA',
        fiscalYearStart: '01-01',
        active: true
    });

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold text-gray-800">Company Details</h2>
                {!isEditing ? (
                    <button
                        onClick={() => setIsEditing(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 font-medium"
                    >
                        {ICONS.edit} Edit Details
                    </button>
                ) : (
                    <div className="flex gap-2">
                        <button
                            onClick={() => setIsEditing(false)}
                            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => setIsEditing(false)}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                        >
                            Save Changes
                        </button>
                    </div>
                )}
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Logo Section */}
                    <div className="col-span-2 flex items-center gap-6 pb-6 border-b border-gray-100">
                        <div className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center text-gray-400">
                            {ICONS.camera}
                        </div>
                        <div>
                            <h3 className="font-medium text-gray-900">Company Logo</h3>
                            <p className="text-sm text-gray-500 mb-2">Recommended size: 400x400px</p>
                            {isEditing && (
                                <button className="text-sm text-green-600 font-medium hover:text-green-700">Upload new logo</button>
                            )}
                        </div>
                    </div>

                    {/* Basic Info */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                            {isEditing ? (
                                <input
                                    type="text"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                                />
                            ) : (
                                <p className="text-gray-900 font-medium">{formData.name}</p>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Domain / Email Suffix</label>
                            {isEditing ? (
                                <input
                                    type="text"
                                    value={formData.domain}
                                    onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                                />
                            ) : (
                                <p className="text-gray-900">{formData.domain}</p>
                            )}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Headquarters</label>
                            {isEditing ? (
                                <input
                                    type="text"
                                    value={formData.headquarters}
                                    onChange={(e) => setFormData({ ...formData, headquarters: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                                />
                            ) : (
                                <p className="text-gray-900">{formData.headquarters}</p>
                            )}
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Fiscal Year Start</label>
                            {isEditing ? (
                                <select className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500">
                                    <option value="01-01">January 1st</option>
                                    <option value="04-01">April 1st</option>
                                    <option value="07-01">July 1st</option>
                                    <option value="10-01">October 1st</option>
                                </select>
                            ) : (
                                <p className="text-gray-900">January 1st</p>
                            )}
                        </div>
                    </div>

                    <div className="col-span-2 pt-4 border-t border-gray-100">
                        <div className="flex items-center gap-3">
                            <label className="text-sm font-medium text-gray-700">Active Status</label>
                            {isEditing ? (
                                <input
                                    type="checkbox"
                                    checked={formData.active}
                                    onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                                    className="h-4 w-4 text-green-600 rounded border-gray-300 focus:ring-green-500"
                                />
                            ) : (
                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${formData.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                    {formData.active ? 'Active' : 'Inactive'}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CompanyDetails;
