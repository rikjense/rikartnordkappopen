import { SocketProvider } from '../context/SocketContext';
import '../styles/globals.css';

function DartTournamentApp({ Component, pageProps }) {
  return (
    <SocketProvider>
      <Component {...pageProps} />
    </SocketProvider>
  );
}

export default DartTournamentApp; 