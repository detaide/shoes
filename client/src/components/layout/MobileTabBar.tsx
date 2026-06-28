import { NavLink } from 'react-router-dom';
import Icon from '@/components/common/Icon';
import { NAV_ITEMS } from './nav-items';
import './MobileTabBar.css';

export default function MobileTabBar() {
  return (
    <nav className="mobile-tab-bar">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.key}
          to={item.path}
          className={({ isActive }) =>
            `mobile-tab-item${isActive ? ' active' : ''}`
          }
          aria-label={item.label}
        >
          {({ isActive }) => (
            <>
              <Icon name={item.icon} size={22} filled={isActive} />
              <span className="mobile-tab-label">{item.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
