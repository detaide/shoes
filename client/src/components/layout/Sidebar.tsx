import { NavLink } from 'react-router-dom';
import Icon from '@/components/common/Icon';
import { NAV_ITEMS } from './nav-items';
import './Sidebar.css';

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <Icon name="sparkles" size={20} />
        <span>AI 鞋类生图</span>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.key}
            to={item.path}
            className={({ isActive }) =>
              `sidebar-item${isActive ? ' active' : ''}`
            }
          >
            {({ isActive }) => (
              <>
                <Icon name={item.icon} size={20} filled={isActive} />
                <span className="sidebar-label">{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
