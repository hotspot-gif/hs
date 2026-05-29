import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import type { RpaUser } from '@/types';
import { X, Save, AlertCircle } from 'lucide-react';

interface ISDMSettingsProps {
  user?: RpaUser;
  onClose: () => void;
  onSettingsSaved?: () => void;
}

interface Settings {
  ga_weightage: number;
  uao_weightage: number;
  na_weightage: number;
  zone_manager_slab: number;
  asm_slab: number;
  rsm_slab: number;
  bracket_90_95_percent: number;
  bracket_95_100_percent: number;
  bracket_100_105_percent: number;
  bracket_106_119_percent: number;
  bracket_120_above_percent: number;
}

const DEFAULT_SETTINGS: Settings = {
  ga_weightage: 75,
  uao_weightage: 25,
  na_weightage: 0,
  zone_manager_slab: 700,
  asm_slab: 1000,
  rsm_slab: 1500,
  bracket_90_95_percent: 50,
  bracket_95_100_percent: 80,
  bracket_100_105_percent: 100,
  bracket_106_119_percent: 110,
  bracket_120_above_percent: 120,
};

export default function ISDMSettings({ user, onClose, onSettingsSaved }: ISDMSettingsProps) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  // Check if user is HS-ADMIN
  if (user?.role !== 'HS-ADMIN') {
    return null;
  }

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('isdm_settings')
        .select('*')
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching settings:', error);
        setSettings(DEFAULT_SETTINGS);
      } else if (data) {
        setSettings(data);
      }
    } catch (err) {
      console.error('Error:', err);
      setSettings(DEFAULT_SETTINGS);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    try {
      setSaving(true);
      
      const { error } = await supabase
        .from('isdm_settings')
        .upsert([settings], { onConflict: 'id' });

      if (error) {
        setMessage('Error saving settings: ' + error.message);
      } else {
        setMessage('Settings saved successfully!');
        // Notify parent component that settings were saved
        if (onSettingsSaved) {
          onSettingsSaved();
        }
        setTimeout(() => setMessage(''), 3000);
      }
    } catch (err) {
      setMessage('Error: ' + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (field: keyof Settings, value: number) => {
    setSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg p-8 max-w-2xl w-full mx-4">
          <p className="text-center text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between p-6 border-b border-gray-200 bg-white">
          <h2 className="text-2xl font-bold text-[#21264E]">ISDM Settings</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition"
          >
            <X size={24} className="text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-8">
          {/* Weightage Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-[#21264E] flex items-center gap-2">
              <span className="text-blue-600">●</span> Weightage Percentages
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pl-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  GA Weightage (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={settings.ga_weightage}
                  onChange={(e) => handleChange('ga_weightage', parseFloat(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  UAO Weightage (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={settings.uao_weightage}
                  onChange={(e) => handleChange('uao_weightage', parseFloat(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  NA Weightage (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={settings.na_weightage}
                  onChange={(e) => handleChange('na_weightage', parseFloat(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Commission Slabs Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-[#21264E] flex items-center gap-2">
              <span className="text-purple-600">●</span> Commission Slabs (€)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pl-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Zone Manager Slab (€)
                </label>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={settings.zone_manager_slab}
                  onChange={(e) => handleChange('zone_manager_slab', parseFloat(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  ASM Slab (€)
                </label>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={settings.asm_slab}
                  onChange={(e) => handleChange('asm_slab', parseFloat(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  RSM / Country Manager Slab (€)
                </label>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={settings.rsm_slab}
                  onChange={(e) => handleChange('rsm_slab', parseFloat(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                />
              </div>
            </div>
          </div>

          {/* Incentive Earning Brackets Section */}
          <div className="space-y-4">
            <h3 className="text-lg font-bold text-[#21264E] flex items-center gap-2">
              <span className="text-green-600">●</span> Incentive Earning % by Weightage Bracket
            </h3>
            <div className="pl-6 space-y-3">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  90% - 95% Weightage → Earning % 
                </label>
                <input
                  type="number"
                  min="0"
                  max="200"
                  step="5"
                  value={settings.bracket_90_95_percent}
                  onChange={(e) => handleChange('bracket_90_95_percent', parseFloat(e.target.value))}
                  className="w-full md:w-48 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  95% - 100% Weightage → Earning %
                </label>
                <input
                  type="number"
                  min="0"
                  max="200"
                  step="5"
                  value={settings.bracket_95_100_percent}
                  onChange={(e) => handleChange('bracket_95_100_percent', parseFloat(e.target.value))}
                  className="w-full md:w-48 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  100% - 105% Weightage → Earning %
                </label>
                <input
                  type="number"
                  min="0"
                  max="200"
                  step="5"
                  value={settings.bracket_100_105_percent}
                  onChange={(e) => handleChange('bracket_100_105_percent', parseFloat(e.target.value))}
                  className="w-full md:w-48 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  106% - 119% Weightage → Earning %
                </label>
                <input
                  type="number"
                  min="0"
                  max="200"
                  step="5"
                  value={settings.bracket_106_119_percent}
                  onChange={(e) => handleChange('bracket_106_119_percent', parseFloat(e.target.value))}
                  className="w-full md:w-48 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  120% & Above Weightage → Earning %
                </label>
                <input
                  type="number"
                  min="0"
                  max="200"
                  step="5"
                  value={settings.bracket_120_above_percent}
                  onChange={(e) => handleChange('bracket_120_above_percent', parseFloat(e.target.value))}
                  className="w-full md:w-48 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>
          </div>

          {/* Message */}
          {message && (
            <div className={`p-4 rounded-lg flex items-start gap-3 ${
              message.includes('Error') ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'
            }`}>
              <AlertCircle className={message.includes('Error') ? 'text-red-600' : 'text-green-600'} size={20} />
              <p className={message.includes('Error') ? 'text-red-700' : 'text-green-700'}>
                {message}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-end gap-3 p-6 border-t border-gray-200 bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={saveSettings}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
          >
            <Save size={18} />
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </div>
    </div>
  );
}
