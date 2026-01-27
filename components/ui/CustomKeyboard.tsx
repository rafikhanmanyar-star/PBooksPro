import React from 'react';
import { useKeyboard } from '../../context/KeyboardContext';

const Key: React.FC<{ value: string; className?: string; onClick: (value: string) => void }> = ({ value, className, onClick }) => (
  <button
    type="button"
    onClick={() => onClick(value)}
    className={`h-12 sm:h-14 rounded-lg shadow-sm font-semibold text-xl flex items-center justify-center transition-colors transform active:scale-95 active:bg-slate-300 ${className}`}
  >
    {value}
  </button>
);

const CustomKeyboard: React.FC = () => {
  const { onKeyPress, closeKeyboard, keyboardType } = useKeyboard();

  const handleKeyPress = (key: string) => {
    onKeyPress(key);
  };
  
  const backspaceIcon = <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"></path><line x1="18" y1="9" x2="12" y2="15"></line><line x1="12" y1="9" x2="18" y2="15"></line></svg>;

  const keysLayout = [
    '1', '2', '3',
    '4', '5', '6',
    '7', '8', '9',
  ];

  return (
    <div className="bg-slate-200/95 backdrop-blur-sm p-2 sm:p-3 border-t border-slate-300/50">
      <div className="grid grid-cols-3 gap-2 sm:gap-3 max-w-sm mx-auto">
        {keysLayout.map((key) => (
          <Key key={key} value={key} onClick={handleKeyPress} className="bg-white/90" />
        ))}
        {keyboardType === 'decimal' ? (
            <Key value="." onClick={handleKeyPress} className="bg-slate-50/90 text-2xl font-bold" />
        ) : (
            <div /> // Placeholder for alignment
        )}
        <Key value="0" onClick={handleKeyPress} className="bg-white/90" />
        <button
            type="button"
            onClick={() => handleKeyPress('backspace')}
            className="h-12 sm:h-14 rounded-lg shadow-sm flex items-center justify-center bg-slate-50/90 transform active:scale-95 active:bg-slate-300"
            aria-label="Backspace"
        >
            {backspaceIcon}
        </button>
      </div>
       <div className="text-center mt-2">
            <button
                type="button"
                onClick={closeKeyboard}
                className="text-sm font-semibold text-slate-600 hover:text-slate-800 p-2 rounded-lg"
            >
                Done
            </button>
        </div>
    </div>
  );
};

export default CustomKeyboard;
