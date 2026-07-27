export default function Toast({ toast }) {
  if (!toast) return null;
  return (
    <div className="toast xp-toast" role="alert">
      {toast.text}
    </div>
  );
}
