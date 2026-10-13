import { useState } from 'react';
import { Sparkles, Plus, Trash2 } from 'lucide-react';

export default function Context() {
  const [activeTab, setActiveTab] = useState<'pestel' | 'swot'>('swot');
  const [showGrokModal, setShowGrokModal] = useState(false);
  const [grokPrompt, setGrokPrompt] = useState('');

  const [swotData, setSwotData] = useState({
    strengths: [
      'Équipe expérimentée en QHSE',
      'Certifications ISO 9001, 14001, 45001',
      'Culture de sécurité forte'
    ],
    weaknesses: [
      'Documentation parfois dispersée',
      'Besoin de digitalisation accrue'
    ],
    opportunities: [
      'Nouvelles réglementations environnementales',
      'Demande croissante pour la RSE'
    ],
    threats: [
      'Évolution rapide des normes',
      'Concurrence internationale'
    ]
  });

  const [pestelData, setPestelData] = useState({
    political: ['Réglementation QHSE stricte', 'Normes ISO obligatoires'],
    economic: ['Coût des certifications', 'Budget formation limité'],
    social: ['Attentes collaborateurs sécurité', 'Bien-être au travail'],
    technological: ['Digitalisation processus', 'IA pour analyse risques'],
    environmental: ['Transition écologique', 'Réduction empreinte carbone'],
    legal: ['RGPD', 'Code du travail', 'Loi climat']
  });

  const handleAddItem = (category: string, value: string) => {
    if (activeTab === 'swot') {
      setSwotData(prev => ({
        ...prev,
        [category]: [...prev[category as keyof typeof swotData], value]
      }));
    } else {
      setPestelData(prev => ({
        ...prev,
        [category]: [...prev[category as keyof typeof pestelData], value]
      }));
    }
  };

  const handleDeleteItem = (category: string, index: number) => {
    if (activeTab === 'swot') {
      setSwotData(prev => ({
        ...prev,
        [category]: prev[category as keyof typeof swotData].filter((_, i) => i !== index)
      }));
    } else {
      setPestelData(prev => ({
        ...prev,
        [category]: prev[category as keyof typeof pestelData].filter((_, i) => i !== index)
      }));
    }
  };

  const handleGrokGenerate = () => {
    // Simulate AI generation
    alert('Analyse générée par Grok IA ! (Fonctionnalité en démo)');
    setShowGrokModal(false);
  };

  return (
    <div className="space-y-6 animate-[fadeIn_0.5s_ease]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-gray-900 dark:text-white mb-2">Point 4 - Contexte de l'Organisation</h1>
          <p className="text-gray-600 dark:text-gray-400">
            Analyse stratégique : PESTEL & SWOT
          </p>
        </div>
        <button
          onClick={() => setShowGrokModal(true)}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-[#6366f1] to-[#818cf8] text-white font-medium rounded-xl shadow-lg shadow-[#6366f1]/30 hover:scale-105 transition-all duration-200"
        >
          <Sparkles className="w-5 h-5" />
          Générer avec Grok IA
        </button>
      </div>

      {/* Tabs */}
      <div className="glass rounded-2xl p-2 inline-flex gap-2">
        <button
          onClick={() => setActiveTab('swot')}
          className={`px-6 py-3 rounded-xl font-medium transition-all duration-200 ${
            activeTab === 'swot'
              ? 'bg-[#6366f1] text-white shadow-lg'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          Analyse SWOT
        </button>
        <button
          onClick={() => setActiveTab('pestel')}
          className={`px-6 py-3 rounded-xl font-medium transition-all duration-200 ${
            activeTab === 'pestel'
              ? 'bg-[#6366f1] text-white shadow-lg'
              : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          Analyse PESTEL
        </button>
      </div>

      {/* SWOT Matrix */}
      {activeTab === 'swot' && (
        <div className="grid md:grid-cols-2 gap-6">
          {/* Strengths */}
          <SWOTCard
            title="Forces (Strengths)"
            items={swotData.strengths}
            color="from-[#10b981] to-[#059669]"
            category="strengths"
            onAdd={handleAddItem}
            onDelete={handleDeleteItem}
          />

          {/* Weaknesses */}
          <SWOTCard
            title="Faiblesses (Weaknesses)"
            items={swotData.weaknesses}
            color="from-[#ef4444] to-[#dc2626]"
            category="weaknesses"
            onAdd={handleAddItem}
            onDelete={handleDeleteItem}
          />

          {/* Opportunities */}
          <SWOTCard
            title="Opportunités (Opportunities)"
            items={swotData.opportunities}
            color="from-[#6366f1] to-[#818cf8]"
            category="opportunities"
            onAdd={handleAddItem}
            onDelete={handleDeleteItem}
          />

          {/* Threats */}
          <SWOTCard
            title="Menaces (Threats)"
            items={swotData.threats}
            color="from-[#f59e0b] to-[#d97706]"
            category="threats"
            onAdd={handleAddItem}
            onDelete={handleDeleteItem}
          />
        </div>
      )}

      {/* PESTEL Analysis */}
      {activeTab === 'pestel' && (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          <PESTELCard
            title="Politique"
            items={pestelData.political}
            color="from-[#6366f1] to-[#818cf8]"
            category="political"
            onAdd={handleAddItem}
            onDelete={handleDeleteItem}
          />
          <PESTELCard
            title="Économique"
            items={pestelData.economic}
            color="from-[#10b981] to-[#059669]"
            category="economic"
            onAdd={handleAddItem}
            onDelete={handleDeleteItem}
          />
          <PESTELCard
            title="Social"
            items={pestelData.social}
            color="from-[#f59e0b] to-[#d97706]"
            category="social"
            onAdd={handleAddItem}
            onDelete={handleDeleteItem}
          />
          <PESTELCard
            title="Technologique"
            items={pestelData.technological}
            color="from-[#818cf8] to-[#6366f1]"
            category="technological"
            onAdd={handleAddItem}
            onDelete={handleDeleteItem}
          />
          <PESTELCard
            title="Environnemental"
            items={pestelData.environmental}
            color="from-[#059669] to-[#10b981]"
            category="environmental"
            onAdd={handleAddItem}
            onDelete={handleDeleteItem}
          />
          <PESTELCard
            title="Légal"
            items={pestelData.legal}
            color="from-[#ef4444] to-[#dc2626]"
            category="legal"
            onAdd={handleAddItem}
            onDelete={handleDeleteItem}
          />
        </div>
      )}

      {/* Grok Modal */}
      {showGrokModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-[fadeIn_0.2s_ease]">
          <div className="glass rounded-2xl p-8 max-w-2xl w-full shadow-2xl animate-[scaleIn_0.2s_ease]">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#6366f1] to-[#818cf8] flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Assistant IA Grok</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">Génération d'analyse automatique</p>
              </div>
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Décrivez votre contexte (optionnel)
              </label>
              <textarea
                value={grokPrompt}
                onChange={(e) => setGrokPrompt(e.target.value)}
                placeholder="Ex: Nous sommes une PME de 50 personnes dans le conseil QHSE..."
                rows={6}
                className="w-full px-4 py-3 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#6366f1] transition-all resize-none"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowGrokModal(false)}
                className="flex-1 px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-medium rounded-xl hover:bg-gray-300 dark:hover:bg-gray-600 transition-all"
              >
                Annuler
              </button>
              <button
                onClick={handleGrokGenerate}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-[#6366f1] to-[#818cf8] text-white font-bold rounded-xl shadow-lg shadow-[#6366f1]/30 hover:scale-105 transition-all"
              >
                Générer l'analyse
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// SWOT Card Component
function SWOTCard({ title, items, color, category, onAdd, onDelete }: any) {
  const [newItem, setNewItem] = useState('');
  const [showInput, setShowInput] = useState(false);

  const handleAdd = () => {
    if (newItem.trim()) {
      onAdd(category, newItem);
      setNewItem('');
      setShowInput(false);
    }
  };

  return (
    <div className="glass rounded-2xl p-6">
      <div className={`inline-flex px-4 py-2 rounded-xl bg-gradient-to-r ${color} text-white font-bold mb-4`}>
        {title}
      </div>
      <ul className="space-y-2 mb-4">
        {items.map((item: string, index: number) => (
          <li key={index} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg group hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{item}</span>
            <button
              onClick={() => onDelete(category, index)}
              className="opacity-0 group-hover:opacity-100 text-[#ef4444] hover:scale-110 transition-all"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </li>
        ))}
      </ul>
      
      {showInput ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Nouvelle entrée..."
            autoFocus
            className="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
          />
          <button onClick={handleAdd} className="px-4 py-2 bg-[#10b981] text-white rounded-lg text-sm font-medium hover:bg-[#059669] transition-colors">
            OK
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowInput(true)}
          className="flex items-center gap-2 text-sm text-[#6366f1] hover:text-[#5558e3] font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Ajouter
        </button>
      )}
    </div>
  );
}

// PESTEL Card Component (similar structure)
function PESTELCard({ title, items, color, category, onAdd, onDelete }: any) {
  const [newItem, setNewItem] = useState('');
  const [showInput, setShowInput] = useState(false);

  const handleAdd = () => {
    if (newItem.trim()) {
      onAdd(category, newItem);
      setNewItem('');
      setShowInput(false);
    }
  };

  return (
    <div className="glass rounded-2xl p-6">
      <div className={`inline-flex px-4 py-2 rounded-xl bg-gradient-to-r ${color} text-white font-bold mb-4`}>
        {title}
      </div>
      <ul className="space-y-2 mb-4">
        {items.map((item: string, index: number) => (
          <li key={index} className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg group hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">{item}</span>
            <button
              onClick={() => onDelete(category, index)}
              className="opacity-0 group-hover:opacity-100 text-[#ef4444] hover:scale-110 transition-all"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </li>
        ))}
      </ul>
      
      {showInput ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="Nouvelle entrée..."
            autoFocus
            className="flex-1 px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#6366f1]"
          />
          <button onClick={handleAdd} className="px-4 py-2 bg-[#10b981] text-white rounded-lg text-sm font-medium hover:bg-[#059669] transition-colors">
            OK
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowInput(true)}
          className="flex items-center gap-2 text-sm text-[#6366f1] hover:text-[#5558e3] font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          Ajouter
        </button>
      )}
    </div>
  );
}
