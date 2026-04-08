'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function Navbar({ currentPage, onNavigate, theme, toggleTheme }) {
    const [mobileOpen, setMobileOpen] = useState(false);

    const navItems = [
        { id: 'overview', label: 'Overview' },
        { id: 'live', label: 'Live' },
        { id: 'news', label: 'News' },
        { id: 'rankings', label: 'Rankings' },
        { id: 'teams', label: 'Teams' },
        { id: 'players', label: 'Players' },
        { id: 'predictor', label: 'Predictor' },
        { id: 'settings', label: 'Settings' },
    ];

    const handleNav = (id) => {
        onNavigate(id);
        setMobileOpen(false);
    };

    return (
        <nav className="navbar">
            <div className="navbar-inner">
                <div className="navbar-brand-shell">
                    <p className="navbar-kicker">Ballpark Control Room</p>
                    <div className="navbar-brand" onClick={() => handleNav('overview')}>
                        <span className="brand-word">COMPOSITE</span>
                        <span className="brand-accent">MLB</span>
                    </div>
                </div>

                <ul className={`nav-links ${mobileOpen ? 'open' : ''}`}>
                    {navItems.map(item => (
                        <li key={item.id}>
                            <a
                                className={currentPage === item.id ? 'active' : ''}
                                onClick={() => handleNav(item.id)}
                                style={{ cursor: 'pointer' }}
                            >
                                <span>{item.label}</span>
                            </a>
                        </li>
                    ))}
                </ul>

                <div className="navbar-controls">
                    <Link href="/" className="nav-hub-link">
                        Back To Hub
                    </Link>
                    <button className="theme-toggle" onClick={toggleTheme} title="Toggle theme">
                        {theme === 'dark' ? 'Light' : 'Dark'}
                    </button>
                    <button
                        className="nav-mobile-toggle"
                        onClick={() => setMobileOpen(!mobileOpen)}
                    >
                        {mobileOpen ? '✕' : '☰'}
                    </button>
                </div>
            </div>
        </nav>
    );
}
