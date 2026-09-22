"use client";

export function DeleteSellerButton() {
  return (
    <button
      type="submit"
      className="text-xs font-medium text-rose-400 hover:text-rose-300"
      onClick={(e) => {
        if (
          !confirm(
            "Supprimer ce vendeur ? Son compte et son profil seront définitivement supprimés.",
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      Supprimer
    </button>
  );
}
