import Button from '../components/Button.jsx';

export default function NotFound() {
  return (
    <div className="container" style={{ textAlign: 'center', padding: '96px 0', display: 'grid', gap: 12, justifyItems: 'center' }}>
      <h1>Page not found</h1>
      <p>The page you are looking for does not exist.</p>
      <Button to="/">Back to home</Button>
    </div>
  );
}
