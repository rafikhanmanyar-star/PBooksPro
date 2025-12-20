
import React, { useEffect, useState } from 'react';
import { ICONS } from '../../constants';

interface ScrollToTopProps {
  containerId: string;
}

const ScrollToTop: React.FC<ScrollToTopProps> = ({ containerId }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const container = document.getElementById(containerId);
    if (!container) return;

    const toggleVisibility = () => {
      if (container.scrollTop > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    container.addEventListener('scroll', toggleVisibility);

    // Check initial position
    toggleVisibility();

    return () => container.removeEventListener('scroll', toggleVisibility);
  }, [containerId]);

  const scrollToTop = () => {
    const container = document.getElementById(containerId);
    container?.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  if (!isVisible) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={scrollToTop}
      className="fixed bottom-24 left-6 z-40 p-3 rounded-full bg-slate-800/90 text-white shadow-xl backdrop-blur-sm border border-slate-700/50 transition-all duration-300 animate-fade-in-up hover:bg-slate-700 hover:scale-110 active:scale-95"
      aria-label="Scroll to top"
      title="Scroll to Top"
    >
      <div className="w-5 h-5">
        {ICONS.arrowUp}
      </div>
    </button>
  );
};

export default ScrollToTop;
