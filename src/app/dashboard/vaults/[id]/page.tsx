export default function VaultDetailPage({ params }) {
  return (
    <div className="min-h-screen bg-zinc-950 p-6">
      <h1 className="text-3xl font-bold text-center mb-4">Vault Details</h1>
      <p className="text-center text-zinc-400">
        This is the vault details page for vault ID: {params.id}
      </p>
    </div>
  );
}
