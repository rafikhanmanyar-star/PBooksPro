import React from 'react';
import { POSProvider } from '../../context/POSContext';
import POSSalesContent from './POSSalesContent';

function POSSalesPage() {
    return (
        <POSProvider>
            <POSSalesContent />
        </POSProvider>
    );
}

export default POSSalesPage;
