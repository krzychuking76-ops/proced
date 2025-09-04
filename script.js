// script.js — wersja dla GitHub Pages (bez File System Access API)

class ProcedureManager {
    constructor() {
        this.procedures = [];
        this.searchTerm = "";
        this.currentCategory = null;
        this.categories = {};
        this.init();
    }

    init() {
        this.loadDemoData();
        this.setupEventListeners();
        this.renderCategories();
    }

    loadDemoData() {
        this.procedures = [
            { name: "Procedura rekrutacji", category: "hr", description: "Opis procedury rekrutacji", lastModified: "2024-01-15", size: 123456 },
            { name: "Procedura zwolnień", category: "hr", description: "Opis procedury zwolnień", lastModified: "2024-02-10", size: 98765 },
            { name: "Budżet 2024", category: "finanse", description: "Roczny budżet na 2024", lastModified: "2024-01-20", size: 456789 },
            { name: "Procedura backup", category: "it", description: "Instrukcja tworzenia kopii zapasowych", lastModified: "2024-02-05", size: 234567 },
            { name: "Kontrola jakości", category: "jakość", description: "Procedura kontroli jakości produktów", lastModified: "2024-01-30", size: 345678 },
            { name: "Procedury BHP", category: "bezpieczeństwo", description: "Zasady bezpieczeństwa i higieny pracy", lastModified: "2024-02-01", size: 567890 },
            { name: "Regulamin pracy", category: "ogólne", description: "Ogólny regulamin pracy firmy", lastModified: "2024-01-10", size: 123000 }
        ];

        this.categories = {};
        this.procedures.forEach(proc => {
            if (!this.categories[proc.category]) {
                this.categories[proc.category] = proc.category.charAt(0).toUpperCase() + proc.category.slice(1);
            }
        });
    }

    setupEventListeners() {
        document.getElementById("btn-odswiez").addEventListener("click", () => this.renderCategories());
        document.getElementById("btn-search").addEventListener("click", () => {
            const term = document.getElementById("search-input").value.trim();
            this.searchTerm = term;
            this.renderSearchResults();
        });
        document.getElementById("btn-back-to-categories").addEventListener("click", () => this.renderCategories());
    }

    renderCategories() {
        this.currentCategory = null;
        const container = document.getElementById("category-list");
        container.innerHTML = "";

        Object.keys(this.categories).forEach(cat => {
            const count = this.procedures.filter(p => p.category === cat).length;
            const div = document.createElement("div");
            div.className = "category-card";
            div.innerHTML = `<h3>${this.categories[cat]}</h3><p>Liczba procedur: ${count}</p>`;
            div.addEventListener("click", () => this.renderCategoryProcedures(cat));
            container.appendChild(div);
        });

        document.getElementById("procedures-list").style.display = "none";
        container.style.display = "grid";
        document.getElementById("btn-back-to-categories").style.display = "none";
    }

    renderCategoryProcedures(category) {
        this.currentCategory = category;
        const container = document.getElementById("procedures-list");
        container.innerHTML = "";

        const filtered = this.procedures.filter(p => p.category === category);
        filtered.forEach(proc => {
            const card = document.createElement("div");
            card.className = "procedure-card";
            card.innerHTML = `
                <div class="procedure-header"><div class="procedure-name">${proc.name}</div></div>
                <div class="procedure-meta">${this.formatFileSize(proc.size)} | ${proc.lastModified}</div>
                <div class="procedure-description">${proc.description}</div>
            `;
            container.appendChild(card);
        });

        document.getElementById("category-list").style.display = "none";
        container.style.display = "grid";
        document.getElementById("btn-back-to-categories").style.display = "block";
    }

    renderSearchResults() {
        const term = this.searchTerm.toLowerCase();
        const container = document.getElementById("procedures-list");
        container.innerHTML = "";

        const results = this.procedures.filter(p =>
            p.name.toLowerCase().includes(term) ||
            p.description.toLowerCase().includes(term)
        );

        if (results.length === 0) {
            container.innerHTML = `<div class="empty-state"><h3>Brak wyników</h3><p>Nie znaleziono procedur pasujących do zapytania.</p></div>`;
        } else {
            results.forEach(proc => {
                const card = document.createElement("div");
                card.className = "procedure-card";
                card.innerHTML = `
                    <div class="procedure-header"><div class="procedure-name">${proc.name}</div></div>
                    <div class="procedure-meta">${this.formatFileSize(proc.size)} | ${proc.lastModified}</div>
                    <div class="procedure-description">${proc.description}</div>
                `;
                container.appendChild(card);
            });
        }

        document.getElementById("category-list").style.display = "none";
        container.style.display = "grid";
        document.getElementById("btn-back-to-categories").style.display = "block";
    }

    formatFileSize(bytes) {
        const sizes = ["B", "KB", "MB", "GB"];
        if (bytes === 0) return "0 B";
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return (bytes / Math.pow(1024, i)).toFixed(2) + " " + sizes[i];
    }
}

document.addEventListener("DOMContentLoaded", () => {
    window.procedureManager = new ProcedureManager();
});
