import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RouteShell } from './components/RouteShell';
import About from './pages/About';
import CardPool from './pages/CardPool';
import Drift from './pages/Drift';
import Draw from './pages/Draw';
import Home from './pages/Home';
import Learn from './pages/Learn';
import OC from './pages/OC';
import Remake from './pages/Remake';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RouteShell />,
    children: [
      { index: true, element: <Home /> },
      { path: 'draw', element: <Draw /> },
      { path: 'learn', element: <Navigate to="/learn/preview" replace /> },
      { path: 'learn/:cardId', element: <Learn /> },
      { path: 'remake', element: <Navigate to="/remake/preview" replace /> },
      { path: 'remake/:cardId', element: <Remake /> },
      { path: 'drift', element: <Drift /> },
      { path: 'oc', element: <OC /> },
      { path: 'about', element: <About /> },
      { path: 'cards', element: <CardPool /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);