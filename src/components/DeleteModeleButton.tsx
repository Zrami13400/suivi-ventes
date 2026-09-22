"use client";

export function DeleteModeleButton() {
  return (
    <button
      type="submit"
      className="text-xs font-medium text-rose-400 hover:text-rose-300"
      onClick={(e) => {
        if (
          !confirm(
            "Supprimer ce modèle ? Les ventes déjà enregistrées ne sont pas affectées.",
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
