// System Archiwizacji Procedur Lokalnych
// Główny plik JavaScript

class ProcedureManager {
    constructor() {
        this.currentView = 'current'; // 'current' lub 'archive'
        this.currentFilter = '';
        this.searchTerm = '';
        this.procedures = new Map(); // Mapa procedur załadowanych z systemu plików
        this.directoryHandle = null; // Handle do głównego katalogu
        this.currentDetailsProcedure = null; // Przechowuje aktualnie edytowaną procedurę w modalu szczegółów
        this.currentCategoryView = null; // Przechowuje aktualnie przeglądaną kategorię
        this.isSearching = false; // Nowa flaga do zarządzania widokiem wyszukiwania
        this.categories = { // Domyślne kategorie
            'rozliczenia': 'Rozliczenia',
            'sprawozdawczość': 'Sprawozdawczość',
            'ogolne_procedury': 'Ogólne procedury'
        };
        
        this.init();
    }

    async init() {
        this.setupEventListeners();
        await this.checkFileSystemSupport();
        this.renderCategories(); // Początkowo renderuj kategorie
        this.updateCategoryDropdowns();
        // Automatyczne odświeżanie po inicjalizacji, aby załadować dane
        this.refreshProcedures();
    }

    setupEventListeners() {
        // Przyciski główne
        document.getElementById('btn-dodaj-procedure').addEventListener('click', () => this.showAddModal());
        document.getElementById('btn-dodaj-kategorie').addEventListener('click', () => this.showAddCategoryModal());
        document.getElementById('btn-odswież').addEventListener('click', () => this.refreshProcedures());
        
        // Wyszukiwanie i filtrowanie
        document.getElementById('search-input').addEventListener('input', (e) => this.handleSearch(e.target.value));
        document.getElementById('btn-search').addEventListener('click', () => this.handleSearch(document.getElementById('search-input').value));
        
        // Przełączanie widoków
        document.getElementById('btn-view-current').classList.add('active'); // Domyślnie aktywny widok aktualnych
        document.getElementById('btn-view-current').addEventListener('click', () => this.switchView('current'));
        document.getElementById('btn-view-archive').addEventListener('click', () => this.switchView('archive'));
        
        // Przycisk powrotu do kategorii
        document.getElementById('btn-back-to-categories').addEventListener('click', () => this.renderCategories());

        // Obsługa filtra kategorii w widoku procedur
        document.getElementById('category-filter').addEventListener('change', (e) => this.handleFilter(e.target.value));

        // Modals
        this.setupModalListeners();
        
        // Obsługa klawiatury
        document.addEventListener('keydown', (e) => this.handleKeyboard(e));
    }

    setupModalListeners() {
        // Modale
        const modal = document.getElementById('modal');
        const updateModal = document.getElementById('update-modal');
        const detailsModal = document.getElementById('details-modal');
        const addCategoryModal = document.getElementById('add-category-modal');
        
        // Zamykanie modali
        document.querySelectorAll('.close').forEach(closeBtn => {
            closeBtn.addEventListener('click', () => this.closeModals());
        });
        
        document.getElementById('btn-cancel').addEventListener('click', () => this.closeModals());
        document.getElementById('btn-update-cancel').addEventListener('click', () => this.closeModals());
        document.getElementById('btn-details-cancel').addEventListener('click', () => this.closeModals());
        document.getElementById('btn-add-category-cancel').addEventListener('click', () => this.closeModals());
        
        // Kliknięcie poza modalem
        window.addEventListener('click', (e) => {
            if (e.target === modal || e.target === updateModal || e.target === detailsModal || e.target === addCategoryModal) {
                this.closeModals();
            }
        });
        
        // Formularze
        document.getElementById('procedure-form').addEventListener('submit', (e) => this.handleAddProcedure(e));
        document.getElementById('update-form').addEventListener('submit', (e) => this.handleUpdateProcedure(e));
        document.getElementById('details-form').addEventListener('submit', (e) => this.handleSaveDetails(e));
        document.getElementById('add-category-form').addEventListener('submit', (e) => this.handleAddCategory(e));
    }

    async checkFileSystemSupport() {
        if ('showDirectoryPicker' in window) {
            this.showMessage('System obsługuje File System Access API. Kliknij "Odśwież" aby wybrać folder z procedurami.', 'info');
        } else {
            this.showMessage('Twoja przeglądarka nie obsługuje File System Access API. Niektóre funkcje mogą być ograniczone.', 'warning');
            this.loadDemoData();
        }
    }

    async refreshProcedures() {
        try {
            this.showLoading(true);
            
            if ('showDirectoryPicker' in window) {
                // Użyj File System Access API
                if (!this.directoryHandle) {
                    this.directoryHandle = await window.showDirectoryPicker();
                }
                await this.loadProceduresFromFileSystem();
            } else {
                // Fallback - załaduj dane demo
                this.loadDemoData();
            }
            
            if (this.isSearching) {
                this.renderSearchResults(); // Jeśli jesteśmy w trybie wyszukiwania, odśwież wyniki
            } else if (this.currentCategoryView) {
                this.renderCategoryProcedures(this.currentCategoryView); // Odśwież widok procedur, jeśli kategoria jest wybrana
            } else {
                this.renderCategories(); // W przeciwnym razie renderuj kategorie
            }
            this.updateCategoryDropdowns(); // Zawsze aktualizuj dropdowny po odświeżeniu
            this.showLoading(false);
        } catch (error) {
            console.error('Błąd podczas odświeżania procedur:', error);
            this.showMessage('Błąd podczas ładowania procedur: ' + error.message, 'error');
            this.showLoading(false);
        }
    }

    async loadProceduresFromFileSystem() {
        this.procedures.clear();
        
        // Załaduj procedury z folderu "procedury"
        await this.loadFromDirectory('procedury', false);
        
        // Załaduj procedury z folderu "archiwum"
        await this.loadFromDirectory('archiwum', true);
    }

    async loadFromDirectory(dirName, isArchive) {
        try {
            const dirHandle = await this.directoryHandle.getDirectoryHandle(dirName);
            
            for await (const [categoryName, categoryHandle] of dirHandle.entries()) {
                if (categoryHandle.kind === 'directory') {
                    // Dodaj nowo znalezioną kategorię do listy, jeśli jej nie ma
                    if (!this.categories[categoryName]) {
                        this.categories[categoryName] = categoryName.charAt(0).toUpperCase() + categoryName.slice(1); // Domyślna nazwa wyświetlana
                    }
                    await this.loadCategoryProcedures(categoryHandle, categoryName, isArchive);
                }
            }
        } catch (error) {
            console.warn(`Nie można załadować katalogu ${dirName}:`, error);
        }
    }

    async loadCategoryProcedures(categoryHandle, categoryName, isArchive) {
        const filesInFolder = [];
        for await (const [fileName, fileHandle] of categoryHandle.entries()) {
            filesInFolder.push({ fileName, fileHandle });
        }

        for (const { fileName, fileHandle } of filesInFolder) {
            // Ignoruj pliki .json, ponieważ są one metadanymi dla innych plików
            if (fileName.endsWith('.json')) {
                continue;
            }

            if (fileHandle.kind === 'file') {
                let description = '';
                let procedureName = fileName; // Domyślnie nazwa pliku to nazwa procedury
                let attachments = []; // Nowa tablica na załączniki

                try {
                    const jsonFileName = fileName + '.json';
                    const jsonFileHandle = await categoryHandle.getFileHandle(jsonFileName);
                    const jsonFile = await jsonFileHandle.getFile();
                    const jsonData = JSON.parse(await jsonFile.text());
                    description = jsonData.description || '';
                    procedureName = jsonData.name || fileName; // Użyj nazwy z JSON, jeśli istnieje
                    attachments = jsonData.attachments || []; // Wczytaj załączniki z JSON
                } catch (e) {
                    // Brak pliku opisu, kontynuuj
                }

                const file = await fileHandle.getFile();
                const procedure = {
                    name: procedureName, // Użyj nazwy z JSON lub nazwy pliku
                    originalFileName: fileName, // Zachowaj oryginalną nazwę pliku
                    category: categoryName,
                    size: file.size,
                    lastModified: new Date(file.lastModified),
                    isArchive: isArchive,
                    fileHandle: fileHandle,
                    file: file,
                    description: description, // Dodaj opis do obiektu procedury
                    attachments: attachments // Dodaj załączniki do obiektu procedury
                };
                
                const key = `${categoryName}/${fileName}/${isArchive ? 'archive' : 'current'}`;
                this.procedures.set(key, procedure);
            }
        }
    }

    loadDemoData() {
        // Dane demonstracyjne gdy File System Access API nie jest dostępne
        const demoData = [
            { name: 'Procedura rekrutacji', originalFileName: 'Procedura_rekrutacji.docx', category: 'hr', isArchive: false, lastModified: new Date('2024-01-15'), description: 'Opis procedury rekrutacji', attachments: [] },
            { name: 'Procedura zwolnień', originalFileName: 'Procedura_zwolnień.docx', category: 'hr', isArchive: false, lastModified: new Date('2024-02-10'), description: 'Opis procedury zwolnień', attachments: [] },
            { name: 'Procedura rekrutacji v1', originalFileName: 'Procedura_rekrutacji_v1.docx', category: 'hr', isArchive: true, lastModified: new Date('2023-12-01'), description: 'Stara wersja procedury rekrutacji', attachments: [] },
            { name: 'Budżet 2024', originalFileName: 'Budżet_2024.xlsx', category: 'finanse', isArchive: false, lastModified: new Date('2024-01-20'), description: 'Roczny budżet na 2024', attachments: [] },
            { name: 'Procedura backup', originalFileName: 'Procedura_backup.txt', category: 'it', isArchive: false, lastModified: new Date('2024-02-05'), description: 'Instrukcja tworzenia kopii zapasowych', attachments: [] },
            { name: 'Kontrola jakości', originalFileName: 'Kontrola_jakości.pdf', category: 'jakość', isArchive: false, lastModified: new Date('2024-01-30'), description: 'Procedura kontroli jakości produktów', attachments: [] },
            { name: 'Procedury BHP', originalFileName: 'Procedury_BHP.docx', category: 'bezpieczeństwo', isArchive: false, lastModified: new Date('2024-02-01'), description: 'Zasady bezpieczeństwa i higieny pracy', attachments: [] },
            { name: 'Regulamin pracy', originalFileName: 'Regulamin_pracy.pdf', category: 'ogólne', isArchive: false, lastModified: new Date('2024-01-10'), description: 'Ogólny regulamin pracy firmy', attachments: [] }
        ];

        this.procedures.clear();
        demoData.forEach((proc, index) => {
            const key = `${proc.category}/${proc.originalFileName}/${proc.isArchive ? 'archive' : 'current'}`;
            this.procedures.set(key, {
                ...proc,
                size: Math.floor(Math.random() * 1000000) + 10000, // Losowy rozmiar
                description: proc.description || `Przykładowy opis dla ${proc.name}`
            });
        });
    }

    renderCategories() {
        this.currentCategoryView = null; // Resetuj widok kategorii
        this.isSearching = false; // Wyłącz tryb wyszukiwania
        document.getElementById('procedures-list').style.display = 'none';
        document.getElementById('btn-back-to-categories').style.display = 'none';
        document.querySelector('.filter-container').style.display = 'none'; // Ukryj filtr kategorii na głównym widoku

        const categoryListContainer = document.getElementById('category-list');
        categoryListContainer.style.display = 'grid'; // Pokaż listę kategorii

        const filteredProcedures = Array.from(this.procedures.values()).filter(proc => proc.isArchive === (this.currentView === 'archive'));
        const groupedProcedures = this.groupProceduresByCategory(filteredProcedures);

        let html = '';
        const categoriesKeys = Object.keys(this.categories).sort((a, b) => this.getCategoryDisplayName(a).localeCompare(this.getCategoryDisplayName(b)));

        if (categoriesKeys.length === 0) {
            html = this.renderEmptyStateForCategories();
        } else {
            html = categoriesKeys.map(categoryKey => {
                const displayName = this.getCategoryDisplayName(categoryKey);
                const count = groupedProcedures[categoryKey] ? groupedProcedures[categoryKey].length : 0;
                return `
                    <div class="category-card" data-category="${categoryKey}">
                        <h3>${displayName}</h3>
                        <p>Liczba procedur: ${count}</p>
                    </div>
                `;
            }).join("");       }
        categoryListContainer.innerHTML = html;
        this.attachCategoryEventListeners();
    }

    renderEmptyStateForCategories() {
        const viewText = this.currentView === 'archive' ? 'archiwum' : 'aktualnych procedur';
        return `
            <div class="empty-state">
                <h3>Brak ${viewText}</h3>
                <p>Nie znaleziono żadnych kategorii z procedurami.</p>
                ${this.currentView === 'current' ? '<button class="btn btn-primary" onclick="procedureManager.showAddModal()">Dodaj pierwszą procedurę</button>' : ''}
            </div>
        `;
    }

    attachCategoryEventListeners() {
        document.querySelectorAll('.category-card').forEach(card => {
            card.addEventListener('click', (e) => {
                const category = e.currentTarget.dataset.category;
                this.renderCategoryProcedures(category);
            });
        });
    }

    renderCategoryProcedures(category) {
        this.currentCategoryView = category; // Ustaw aktualnie przeglądaną kategorię
        this.isSearching = false; // Wyłącz tryb wyszukiwania
        document.getElementById('category-list').style.display = 'none'; // Ukryj listę kategorii
        document.getElementById('procedures-list').style.display = 'grid'; // Pokaż listę procedur
        document.getElementById('btn-back-to-categories').style.display = 'block'; // Pokaż przycisk powrotu
        document.querySelector('.filter-container').style.display = 'flex'; // Pokaż filtr kategorii

        // Ustaw wartość filtra kategorii na aktualnie wybraną kategorię
        document.getElementById('category-filter').value = category;

        const container = document.getElementById('procedures-list');
        let filteredProcedures = Array.from(this.procedures.values()).filter(
            proc => proc.isArchive === (this.currentView === 'archive') && proc.category === category
        );

        // Zastosuj wyszukiwanie, jeśli jest aktywne (tylko w ramach kategorii)
        if (this.searchTerm) {
            const searchLower = this.searchTerm.toLowerCase();
            filteredProcedures = filteredProcedures.filter(proc => 
                proc.name.toLowerCase().includes(searchLower) ||
                (proc.description && proc.description.toLowerCase().includes(searchLower))
            );
        }

        // Sortuj procedury w kategorii
        filteredProcedures.sort((a, b) => b.lastModified - a.lastModified);

        if (filteredProcedures.length === 0) {
            container.innerHTML = this.renderEmptyStateForProcedures(category);
        } else {
            container.innerHTML = this.renderCategorySection(category, filteredProcedures);
        }
        this.attachProcedureEventListeners();
    }

    renderEmptyStateForProcedures(category) {
        const viewText = this.currentView === 'archive' ? 'archiwum' : 'aktualnych procedur';
        const categoryDisplayName = this.getCategoryDisplayName(category);
        return `
            <div class="empty-state">
                <h3>Brak ${viewText} w kategorii ${categoryDisplayName}</h3>
                <p>Nie znaleziono żadnych procedur w tej kategorii.</p>
                ${this.currentView === 'current' ? '<button class="btn btn-primary" onclick="procedureManager.showAddModal()">Dodaj pierwszą procedurę</button>' : ''}
            </div>
        `;
    }

    renderProcedures() {
        // Ta funkcja będzie teraz tylko wywoływać renderCategories lub renderCategoryProcedures
        if (this.isSearching) {
            this.renderSearchResults();
        } else if (this.currentCategoryView) {
            this.renderCategoryProcedures(this.currentCategoryView);
        } else {
            this.renderCategories();
        }
    }

    renderSearchResults() {
        this.currentCategoryView = null; // Wyłącz widok kategorii
        this.isSearching = true; // Włącz tryb wyszukiwania
        document.getElementById('category-list').style.display = 'none'; // Ukryj listę kategorii
        document.getElementById('procedures-list').style.display = 'grid'; // Pokaż listę procedur
        document.getElementById('btn-back-to-categories').style.display = 'block'; // Pokaż przycisk powrotu
        document.querySelector('.filter-container').style.display = 'flex'; // Pokaż filtr kategorii

        const container = document.getElementById('procedures-list');
        let allProcedures = Array.from(this.procedures.values()).filter(
            proc => proc.isArchive === (this.currentView === 'archive')
        );

        let searchResults = [];
        if (this.searchTerm) {
            const searchLower = this.searchTerm.toLowerCase();
            searchResults = allProcedures.filter(proc => 
                proc.name.toLowerCase().includes(searchLower) ||
                (proc.description && proc.description.toLowerCase().includes(searchLower))
            );
        } else {
            searchResults = allProcedures; // Jeśli wyszukiwanie puste, pokaż wszystkie procedury
        }

        const groupedResults = this.groupProceduresByCategory(searchResults);
        let html = '';

        if (Object.keys(groupedResults).length === 0) {
            html = `
                <div class="empty-state">
                    <h3>Brak wyników wyszukiwania</h3>
                    <p>Nie znaleziono procedur pasujących do zapytania "${this.searchTerm}".</p>
                </div>
            `;
        } else {
            const sortedCategories = Object.keys(groupedResults).sort((a, b) => this.getCategoryDisplayName(a).localeCompare(this.getCategoryDisplayName(b)));
            html = sortedCategories.map(categoryKey => {
                return this.renderCategorySection(categoryKey, groupedResults[categoryKey]);
            }).join('');
        }
        container.innerHTML = html;
        this.attachProcedureEventListeners();
    }

    getFilteredProcedures() {
        // Ta funkcja będzie używana tylko do grupowania kategorii, nie do bezpośredniego renderowania
        let filtered = Array.from(this.procedures.values());
        
        // Filtruj według widoku (aktualne/archiwum)
        filtered = filtered.filter(proc => proc.isArchive === (this.currentView === 'archive'));
        
        // Filtruj według wyszukiwania (jeśli jesteśmy w widoku procedur)
        if (this.currentCategoryView && this.searchTerm) {
            const searchLower = this.searchTerm.toLowerCase();
            filtered = filtered.filter(proc => 
                proc.name.toLowerCase().includes(searchLower) ||
                (proc.description && proc.description.toLowerCase().includes(searchLower))
            );
        }
        
        return filtered;
    }

    groupProceduresByCategory(procedures) {
        const grouped = {};
        procedures.forEach(proc => {
            if (!grouped[proc.category]) {
                grouped[proc.category] = [];
            }
            grouped[proc.category].push(proc);
        });
        
        // Sortuj procedury w każdej kategorii według daty modyfikacji
        Object.keys(grouped).forEach(category => {
            grouped[category].sort((a, b) => b.lastModified - a.lastModified);
        });
        
        return grouped;
    }

    renderCategorySection(category, procedures) {
        const categoryDisplayName = this.getCategoryDisplayName(category);
        
        return `
            <div class="category-section">
                <div class="category-header">
                    <h3 class="category-title">${categoryDisplayName} (${procedures.length})</h3>
                </div>
                <div class="procedures-grid">
                    ${procedures.map(proc => this.renderProcedureCard(proc)).join('')}
                </div>
            </div>
        `;
    }

    renderProcedureCard(procedure) {
        const statusClass = procedure.isArchive ? 'status-archived' : 'status-current';
        const statusText = procedure.isArchive ? 'Archiwum' : 'Aktualna';
        
        const attachmentsHtml = procedure.attachments.map(att => `
            <button class="btn btn-link btn-download-attachment" data-original-file-name="${att.originalFileName}" data-category="${procedure.category}" data-is-archive="${procedure.isArchive}" data-attachment-path="${att.path}">
                ${att.originalFileName}
            </button>
        `).join('');

        return `
            <div class="procedure-card" data-original-file-name="${procedure.originalFileName}" data-category="${procedure.category}">
                <div class="procedure-header">
                    <div class="procedure-name">${procedure.name}</div>
                </div>
                <div class="procedure-meta">
                    <span class="status-indicator ${statusClass}"></span>
                    ${statusText} | ${this.formatFileSize(procedure.size)} | ${this.formatDate(procedure.lastModified)}
                </div>
                ${attachmentsHtml ? `<div class="procedure-attachments">Załączniki: ${attachmentsHtml}</div>` : ''}
                <div class="procedure-actions">
                    <button class="btn btn-primary btn-download" data-original-file-name="${procedure.originalFileName}" data-category="${procedure.category}">
                        Pobierz
                    </button>
                    ${!procedure.isArchive ? `
                        <button class="btn btn-warning btn-update" data-original-file-name="${procedure.originalFileName}" data-category="${procedure.category}">
                            Aktualizuj
                        </button>
                        <button class="btn btn-secondary btn-move" data-original-file-name="${procedure.originalFileName}" data-category="${procedure.category}">
                            Przenieś
                        </button>
                        <button class="btn btn-info btn-details" data-original-file-name="${procedure.originalFileName}" data-category="${procedure.category}">
                            Szczegóły
                        </button>
                    ` : ''}
                    <button class="btn btn-danger btn-delete" data-original-file-name="${procedure.originalFileName}" data-category="${procedure.category}">
                        Usuń
                    </button>
                </div>
            </div>
        `;
    }

    renderEmptyState() {
        // Ta funkcja nie będzie już używana bezpośrednio, zastąpiona przez renderEmptyStateForCategories i renderEmptyStateForProcedures
        return '';
    }

    attachProcedureEventListeners() {
        // Pobieranie plików
        document.querySelectorAll('.btn-download').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const originalFileName = btn.dataset.originalFileName;
                const category = btn.dataset.category;
                this.downloadProcedure(originalFileName, category);
            });
        });
        
        // Pobieranie załączników
        document.querySelectorAll('.btn-download-attachment').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const originalFileName = btn.dataset.originalFileName;
                const category = btn.dataset.category;
                const isArchive = btn.dataset.isArchive === 'true';
                const attachmentPath = btn.dataset.attachmentPath;
                this.downloadAttachment(originalFileName, category, isArchive, attachmentPath);
            });
        });
        
        // Aktualizacja procedur
        document.querySelectorAll('.btn-update').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const originalFileName = btn.dataset.originalFileName;
                const category = btn.dataset.category;
                this.showUpdateModal(originalFileName, category);
            });
        });
        
        // Przenoszenie procedur
        document.querySelectorAll('.btn-move').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const originalFileName = btn.dataset.originalFileName;
                const category = btn.dataset.category;
                this.showMoveDialog(originalFileName, category);
            });
        });
        
        // Usuwanie procedur
        document.querySelectorAll('.btn-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const originalFileName = btn.dataset.originalFileName;
                const category = btn.dataset.category;
                this.deleteProcedure(originalFileName, category);
            });
        });

        // Szczegóły procedur
        document.querySelectorAll('.btn-details').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const originalFileName = btn.dataset.originalFileName;
                const category = btn.dataset.category;
                this.showDetailsModal(originalFileName, category);
            });
        });
    }

    // Obsługa modali
    showAddModal() {
        document.getElementById('modal-title').textContent = 'Dodaj Procedurę';
        document.getElementById('modal').style.display = 'block';
        document.getElementById('procedure-name').focus(); // Ustaw focus na nowym polu
    }

    showAddCategoryModal() {
        document.getElementById('add-category-modal').style.display = 'block';
        document.getElementById('new-category-name').focus();
    }

    showUpdateModal(originalFileName, category) {
        document.getElementById('update-modal').style.display = 'block';
        document.getElementById('update-info').textContent = 
            `Aktualizujesz procedurę: ${originalFileName} z kategorii ${this.getCategoryDisplayName(category)}. Poprzednia wersja zostanie przeniesiona do archiwum.`;
        
        // Zapisz informacje o aktualizowanej procedurze
        this.currentUpdateProcedure = { originalFileName: originalFileName, category: category };
    }

    showDetailsModal(originalFileName, category) {
        const key = `${category}/${originalFileName}/${this.currentView === 'archive' ? 'archive' : 'current'}`;
        const procedure = this.procedures.get(key);

        if (!procedure) {
            this.showMessage('Nie znaleziono procedury', 'error');
            return;
        }

        document.getElementById('details-modal-title').textContent = `Szczegóły: ${procedure.name}`;
        document.getElementById('details-procedure-name').value = procedure.name;
        document.getElementById('details-procedure-category').value = this.getCategoryDisplayName(procedure.category);
        document.getElementById('details-procedure-description').value = procedure.description || '';
        
        // Wyświetl załączniki
        const attachmentsListDiv = document.getElementById('details-attachments-list');
        attachmentsListDiv.innerHTML = '';
        if (procedure.attachments && procedure.attachments.length > 0) {
            procedure.attachments.forEach(att => {
                const attachmentItem = document.createElement('div');
                attachmentItem.className = 'attachment-item';
                attachmentItem.innerHTML = `
                    <span>${att.originalFileName}</span>
                    <button class="btn btn-danger btn-remove-attachment" data-attachment-path="${att.path}">Usuń</button>
                `;
                attachmentsListDiv.appendChild(attachmentItem);
            });
        }

        this.currentDetailsProcedure = procedure; // Zapisz procedurę do edycji
        document.getElementById('details-modal').style.display = 'block';

        // Dodaj event listenery dla przycisków usuwania załączników
        document.querySelectorAll('.btn-remove-attachment').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const attachmentPath = e.target.dataset.attachmentPath;
                this.removeAttachment(this.currentDetailsProcedure, attachmentPath);
            });
        });
    }

    closeModals() {
        document.getElementById('modal').style.display = 'none';
        document.getElementById('update-modal').style.display = 'none';
        document.getElementById('details-modal').style.display = 'none';
        document.getElementById('add-category-modal').style.display = 'none';
        
        // Wyczyść formularze
        document.getElementById('procedure-form').reset();
        document.getElementById('update-form').reset();
        document.getElementById('details-form').reset();
        document.getElementById('add-category-form').reset();
        this.currentUpdateProcedure = null;
        this.currentDetailsProcedure = null;
        
        // Reset attachment containers visibility
        document.getElementById('attachments-container').style.display = 'none';
        document.getElementById('btn-add-attachments').style.display = 'block';
        document.getElementById('details-attachments-container').style.display = 'none';
        document.getElementById('btn-details-add-attachments').style.display = 'block';
    }

    // Obsługa formularzy
    async handleAddProcedure(e) {
        e.preventDefault();
        
        const procedureNameInput = document.getElementById('procedure-name');
        const fileInput = document.getElementById('procedure-file');
        const categorySelect = document.getElementById('procedure-category');
        const descriptionInput = document.getElementById('procedure-description');
        
        if (!procedureNameInput.value.trim()) {
            this.showMessage('Nazwa procedury jest wymagana', 'error');
            return;
        }
        if (!fileInput.files[0]) {
            this.showMessage('Proszę wybrać plik główny procedury', 'error');
            return;
        }
        
        const attachmentFiles = [];
        for (let i = 1; i <= 3; i++) { // Zmieniono z 4 na 3
            const attachmentInput = document.getElementById(`attachment-file-${i}`);
            if (attachmentInput.files[0]) {
                attachmentFiles.push(attachmentInput.files[0]);
            }
        }

        try {
            await this.addProcedure(
                procedureNameInput.value.trim(),
                fileInput.files[0],
                categorySelect.value,
                descriptionInput.value.trim(),
                attachmentFiles
            );
            
            this.closeModals();
            this.showMessage('Procedura została dodana pomyślnie', 'success');
            await this.refreshProcedures();
        } catch (error) {
            console.error('Błąd podczas dodawania procedury:', error);
            this.showMessage('Błąd podczas dodawania procedury: ' + error.message, 'error');
        }
    }

    async handleAddCategory(e) {
        e.preventDefault();
        const newCategoryName = document.getElementById('new-category-name').value.trim().toLowerCase();
        const newCategoryDisplayName = document.getElementById('new-category-display-name').value.trim();

        if (!newCategoryName || !newCategoryDisplayName) {
            this.showMessage('Nazwa kategorii i nazwa wyświetlana są wymagane.', 'error');
            return;
        }

        if (this.categories[newCategoryName]) {
            this.showMessage(`Kategoria '${newCategoryDisplayName}' (${newCategoryName}) już istnieje.`, 'error');
            return;
        }

        try {
            if ('showDirectoryPicker' in window && this.directoryHandle) {
                // Stwórz folder w 'procedury'
                await this.directoryHandle.getDirectoryHandle('procedury', { create: true });
                const proceduresDir = await this.directoryHandle.getDirectoryHandle('procedury');
                await proceduresDir.getDirectoryHandle(newCategoryName, { create: true });

                // Stwórz folder w 'archiwum'
                await this.directoryHandle.getDirectoryHandle('archiwum', { create: true });
                const archiveDir = await this.directoryHandle.getDirectoryHandle('archiwum');
                await archiveDir.getDirectoryHandle(newCategoryName, { create: true });
            }

            this.categories[newCategoryName] = newCategoryDisplayName;
            this.closeModals();
            this.showMessage(`Kategoria '${newCategoryDisplayName}' została dodana pomyślnie.`, 'success');
            this.updateCategoryDropdowns();
            this.renderCategories(); // Odśwież widok kategorii

        } catch (error) {
            console.error('Błąd podczas dodawania kategorii:', error);
            this.showMessage('Błąd podczas dodawania kategorii: ' + error.message, 'error');
        }
    }

    async handleUpdateProcedure(e) {
        e.preventDefault();
        
        const fileInput = document.getElementById('update-file');
        
        if (!fileInput.files[0] || !this.currentUpdateProcedure) {
            this.showMessage('Błąd podczas aktualizacji procedury', 'error');
            return;
        }
        
        try {
            await this.updateProcedure(
                this.currentUpdateProcedure.originalFileName,
                this.currentUpdateProcedure.category,
                fileInput.files[0]
            );
            
            this.closeModals();
            this.showMessage('Procedura została zaktualizowana pomyślnie', 'success');
            await this.refreshProcedures();
        } catch (error) {
            console.error('Błąd podczas aktualizacji procedury:', error);
            this.showMessage('Błąd podczas aktualizacji procedury: ' + error.message, 'error');
        }
    }

    async handleSaveDetails(e) {
        e.preventDefault();
        if (!this.currentDetailsProcedure) return;

        const newDescription = document.getElementById('details-procedure-description').value.trim();
        const procedure = this.currentDetailsProcedure;

        // Zbierz nowe załączniki
        const newAttachmentFiles = [];
        for (let i = 1; i <= 3; i++) { // Zmieniono z 4 na 3
            const attachmentInput = document.getElementById(`details-attachment-file-${i}`);
            if (attachmentInput.files[0]) {
                newAttachmentFiles.push(attachmentInput.files[0]);
            }
        }

        try {
            if ('showDirectoryPicker' in window && this.directoryHandle) {
                const baseDirName = procedure.isArchive ? 'archiwum' : 'procedury';
                const baseDir = await this.directoryHandle.getDirectoryHandle(baseDirName);
                const categoryDir = await baseDir.getDirectoryHandle(procedure.category);

                // Zapisz opis i nazwę procedury w pliku .json
                const jsonFileName = procedure.originalFileName + '.json';
                const jsonFileHandle = await categoryDir.getFileHandle(jsonFileName, { create: true });
                const writable = await jsonFileHandle.createWritable();
                
                // Zaktualizuj obiekt procedury o nowe załączniki przed zapisem
                const updatedAttachments = [...procedure.attachments];
                for (const newAttFile of newAttachmentFiles) {
                    // Sprawdź, czy załącznik o tej nazwie już istnieje
                    const existingAttachment = updatedAttachments.find(att => att.originalFileName === newAttFile.name);
                    if (!existingAttachment) {
                        // Zapisz nowy załącznik w podfolderze 'attachments'
                        const attachmentsDir = await categoryDir.getDirectoryHandle('attachments', { create: true });
                        const attachmentFileHandle = await attachmentsDir.getFileHandle(newAttFile.name, { create: true });
                        const attachmentWritable = await attachmentFileHandle.createWritable();
                        await attachmentWritable.write(newAttFile);
                        await attachmentWritable.close();
                        updatedAttachments.push({ originalFileName: newAttFile.name, path: `attachments/${newAttFile.name}` });
                    } else {
                        this.showMessage(`Załącznik o nazwie ${newAttFile.name} już istnieje.`, 'warning');
                    }
                }

                await writable.write(JSON.stringify({ name: procedure.name, description: newDescription, attachments: updatedAttachments }));
                await writable.close();

                // Zaktualizuj lokalny obiekt procedury
                procedure.description = newDescription;
                procedure.attachments = updatedAttachments; // Zaktualizuj załączniki w lokalnym obiekcie
            }

            this.closeModals();
            this.showMessage('Szczegóły procedury zostały zaktualizowane', 'success');
            // Odśwież widok, aby załączniki się pojawiły
            this.renderCategoryProcedures(procedure.category);

        } catch (error) {
            console.error('Błąd podczas zapisywania szczegółów:', error);
            this.showMessage('Błąd podczas zapisywania szczegółów: ' + error.message, 'error');
        }
    }

    async removeAttachment(procedure, attachmentPath) {
        if (!confirm(`Czy na pewno chcesz usunąć załącznik "${attachmentPath}"?`)) {
            return;
        }

        try {
            if ('showDirectoryPicker' in window && this.directoryHandle) {
                const baseDirName = procedure.isArchive ? 'archiwum' : 'procedury';
                const baseDir = await this.directoryHandle.getDirectoryHandle(baseDirName);
                const categoryDir = await baseDir.getDirectoryHandle(procedure.category);
                const attachmentsDir = await categoryDir.getDirectoryHandle('attachments');

                const fileNameToRemove = attachmentPath.split('/').pop(); // Pobierz tylko nazwę pliku
                await attachmentsDir.removeEntry(fileNameToRemove);

                // Usuń załącznik z listy w obiekcie procedury
                procedure.attachments = procedure.attachments.filter(att => att.path !== attachmentPath);

                // Zaktualizuj plik JSON procedury
                const jsonFileName = procedure.originalFileName + '.json';
                const jsonFileHandle = await categoryDir.getFileHandle(jsonFileName, { create: true });
                const writable = await jsonFileHandle.createWritable();
                await writable.write(JSON.stringify({ name: procedure.name, description: procedure.description, attachments: procedure.attachments }));
                await writable.close();

                this.showMessage('Załącznik został usunięty', 'success');
                this.showDetailsModal(procedure.originalFileName, procedure.category); // Odśwież modal szczegółów
            }
        } catch (error) {
            console.error('Błąd podczas usuwania załącznika:', error);
            this.showMessage('Błąd podczas usuwania załącznika: ' + error.message, 'error');
        }
    }

    // Główne operacje na plikach
    async addProcedure(procedureName, file, category, description, attachmentFiles) {
        if ('showDirectoryPicker' in window && this.directoryHandle) {
            const proceduresDir = await this.directoryHandle.getDirectoryHandle('procedury');
            const categoryDir = await proceduresDir.getDirectoryHandle(category);
            
            // Zapisz plik procedury
            const fileHandle = await categoryDir.getFileHandle(file.name, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(file);
            await writable.close();

            // Zapisz załączniki
            const savedAttachments = [];
            if (attachmentFiles.length > 0) {
                const attachmentsDir = await categoryDir.getDirectoryHandle('attachments', { create: true });
                for (const attFile of attachmentFiles) {
                    const attachmentFileHandle = await attachmentsDir.getFileHandle(attFile.name, { create: true });
                    const attachmentWritable = await attachmentFileHandle.createWritable();
                    await attachmentWritable.write(attFile);
                    await attachmentWritable.close();
                    savedAttachments.push({ originalFileName: attFile.name, path: `attachments/${attFile.name}` });
                }
            }

            // Zapisz opis, nazwę procedury i załączniki w pliku .json
            const jsonFileName = file.name + '.json';
            const jsonFileHandle = await categoryDir.getFileHandle(jsonFileName, { create: true });
            const writableJson = await jsonFileHandle.createWritable();
            await writableJson.write(JSON.stringify({ name: procedureName, description: description, attachments: savedAttachments }));
            await writableJson.close();

        } else {
            // Fallback - symulacja dodania do danych demo
            const key = `${category}/${file.name}/current`;
            this.procedures.set(key, {
                name: procedureName,
                originalFileName: file.name,
                category: category,
                size: file.size,
                lastModified: new Date(),
                isArchive: false,
                description: description,
                attachments: attachmentFiles.map(att => ({ originalFileName: att.name, path: `attachments/${att.name}` })),
                file: file
            });
        }
    }

    async updateProcedure(originalFileName, category, newFile) {
        if ('showDirectoryPicker' in window && this.directoryHandle) {
            const proceduresDir = await this.directoryHandle.getDirectoryHandle('procedury');
            const archiveDir = await this.directoryHandle.getDirectoryHandle('archiwum');

            const currentCategoryDir = await proceduresDir.getDirectoryHandle(category);
            const archiveCategoryDir = await archiveDir.getDirectoryHandle(category);

            // Znajdź starą procedurę i jej metadane
            const oldFileHandle = await currentCategoryDir.getFileHandle(originalFileName);
            const oldFile = await oldFileHandle.getFile();
            
            let oldProcedureData = { name: originalFileName, description: '', attachments: [] };
            try {
                const oldJsonFileName = originalFileName + '.json';
                const oldJsonFileHandle = await currentCategoryDir.getFileHandle(oldJsonFileName);
                const oldJsonFile = await oldJsonFileHandle.getFile();
                oldProcedureData = JSON.parse(await oldJsonFile.text());
            } catch (e) {
                // Brak pliku opisu, kontynuuj z domyślnymi danymi
            }

            // Utwórz nazwę dla zarchiwizowanej wersji z datą
            const timestamp = new Date().toISOString().replace(/[:.-]/g, '_');
            const oldFileNameWithoutExt = originalFileName.substring(0, originalFileName.lastIndexOf('.'));
            const oldFileExt = originalFileName.substring(originalFileName.lastIndexOf('.'));
            const archivedFileName = `${oldFileNameWithoutExt}_${timestamp}${oldFileExt}`;
            const archivedJsonFileName = `${oldFileNameWithoutExt}_${timestamp}${oldFileExt}.json`;

            // Skopiuj starą wersję do archiwum
            const archivedFileHandle = await archiveCategoryDir.getFileHandle(archivedFileName, { create: true });
            const writableArchive = await archivedFileHandle.createWritable();
            await writableArchive.write(oldFile);
            await writableArchive.close();

            // Skopiuj stare metadane (JSON) do archiwum
            const archivedJsonFileHandle = await archiveCategoryDir.getFileHandle(archivedJsonFileName, { create: true });
            const writableArchiveJson = await archivedJsonFileHandle.createWritable();
            await writableArchiveJson.write(JSON.stringify(oldProcedureData));
            await writableArchiveJson.close();

            // Przenieś załączniki starej procedury do archiwum
            if (oldProcedureData.attachments && oldProcedureData.attachments.length > 0) {
                try {
                    const oldAttachmentsDir = await currentCategoryDir.getDirectoryHandle('attachments');
                    const newArchiveAttachmentsDir = await archiveCategoryDir.getDirectoryHandle('attachments', { create: true });

                    for (const att of oldProcedureData.attachments) {
                        const attFileHandle = await oldAttachmentsDir.getFileHandle(att.originalFileName);
                        const attFile = await attFileHandle.getFile();
                        const newAttFileHandle = await newArchiveAttachmentsDir.getFileHandle(`${oldFileNameWithoutExt}_${timestamp}_${att.originalFileName}`, { create: true });
                        const newAttWritable = await newAttFileHandle.createWritable();
                        await newAttWritable.write(attFile);
                        await newAttWritable.close();
                        await oldAttachmentsDir.removeEntry(att.originalFileName); // Usuń ze starego miejsca
                    }
                } catch (e) {
                    console.warn('Błąd podczas przenoszenia załączników do archiwum:', e);
                }
            }

            // Usuń starą wersję z folderu procedur (plik i json)
            await currentCategoryDir.removeEntry(originalFileName);
            try {
                await currentCategoryDir.removeEntry(originalFileName + '.json');
            } catch (e) {
                // Plik json mógł nie istnieć, ignoruj błąd
            }

            // Dodaj nową wersję (plik)
            const newFileHandle = await currentCategoryDir.getFileHandle(newFile.name, { create: true });
            const writableNew = await newFileHandle.createWritable();
            await writableNew.write(newFile);
            await writableNew.close();

            // Zachowaj metadane (nazwę, opis, załączniki) z poprzedniej wersji, ale zaktualizuj plik główny
            const updatedProcedureData = { 
                name: oldProcedureData.name, 
                description: oldProcedureData.description, 
                attachments: oldProcedureData.attachments // Załączniki pozostają te same, chyba że zostaną zmienione w details
            };

            const newJsonFileName = newFile.name + '.json';
            const newJsonFileHandle = await currentCategoryDir.getFileHandle(newJsonFileName, { create: true });
            const writableNewJson = await newJsonFileHandle.createWritable();
            await writableNewJson.write(JSON.stringify(updatedProcedureData));
            await writableNewJson.close();

        } else {
            // Fallback - symulacja
            const currentKey = `${category}/${originalFileName}/current`;
            const archiveKey = `${category}/${originalFileName}/archive`;
            
            const currentProcedure = this.procedures.get(currentKey);
            if (currentProcedure) {
                // Przenieś do archiwum
                this.procedures.set(archiveKey, { ...currentProcedure, isArchive: true });
                this.procedures.delete(currentKey);
            }
            
            // Dodaj nową wersję
            const newKey = `${category}/${newFile.name}/current`;
            this.procedures.set(newKey, {
                name: currentProcedure?.name || newFile.name, // Zachowaj nazwę procedury
                originalFileName: newFile.name,
                category: category,
                size: newFile.size,
                lastModified: new Date(),
                isArchive: false,
                description: currentProcedure?.description || '', // Zachowaj opis
                attachments: currentProcedure?.attachments || [], // Zachowaj załączniki
                file: newFile
            });
        }
    }

    async downloadProcedure(originalFileName, category) {
        const key = `${category}/${originalFileName}/${this.currentView === 'archive' ? 'archive' : 'current'}`;
        const procedure = this.procedures.get(key);
        
        if (!procedure) {
            this.showMessage('Nie znaleziono procedury', 'error');
            return;
        }
        
        try {
            let file;
            if (procedure.fileHandle) {
                file = await procedure.fileHandle.getFile();
            } else if (procedure.file) {
                file = procedure.file;
            } else {
                throw new Error('Brak dostępu do pliku');
            }
            
            // Utwórz link do pobrania
            const url = URL.createObjectURL(file);
            const a = document.createElement('a');
            a.href = url;
            a.download = originalFileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showMessage('Plik został pobrany', 'success');
        } catch (error) {
            console.error('Błąd podczas pobierania:', error);
            this.showMessage('Błąd podczas pobierania pliku: ' + error.message, 'error');
        }
    }

    async downloadAttachment(procedureOriginalFileName, category, isArchive, attachmentPath) {
        try {
            if ('showDirectoryPicker' in window && this.directoryHandle) {
                const baseDirName = isArchive ? 'archiwum' : 'procedury';
                const baseDir = await this.directoryHandle.getDirectoryHandle(baseDirName);
                const categoryDir = await baseDir.getDirectoryHandle(category);
                const attachmentsDir = await categoryDir.getDirectoryHandle('attachments');

                const fileNameToDownload = attachmentPath.split('/').pop();
                const fileHandle = await attachmentsDir.getFileHandle(fileNameToDownload);
                const file = await fileHandle.getFile();

                const url = URL.createObjectURL(file);
                const a = document.createElement('a');
                a.href = url;
                a.download = fileNameToDownload;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                this.showMessage('Załącznik został pobrany', 'success');
            } else {
                this.showMessage('Pobieranie załączników nie jest obsługiwane w trybie demo.', 'warning');
            }
        } catch (error) {
            console.error('Błąd podczas pobierania załącznika:', error);
            this.showMessage('Błąd podczas pobierania załącznika: ' + error.message, 'error');
        }
    }

    async deleteProcedure(originalFileName, category) {
        if (!confirm(`Czy na pewno chcesz usunąć procedurę "${originalFileName}"?`)) {
            return;
        }
        
        try {
            const key = `${category}/${originalFileName}/${this.currentView === 'archive' ? 'archive' : 'current'}`;
            const procedureToDelete = this.procedures.get(key);
            
            if ('showDirectoryPicker' in window && this.directoryHandle) {
                const baseDir = this.currentView === 'archive' ? 'archiwum' : 'procedury';
                const dir = await this.directoryHandle.getDirectoryHandle(baseDir);
                const categoryDir = await dir.getDirectoryHandle(category);
                
                // Usuń plik procedury
                await categoryDir.removeEntry(originalFileName);
                
                // Usuń plik opisu, jeśli istnieje
                try {
                    await categoryDir.removeEntry(originalFileName + '.json');
                } catch (e) {
                    // Plik json mógł nie istnieć, ignoruj błąd
                }

                // Usuń folder załączników, jeśli istnieje i jest pusty, lub usuń załączniki
                if (procedureToDelete && procedureToDelete.attachments && procedureToDelete.attachments.length > 0) {
                    try {
                        const attachmentsDir = await categoryDir.getDirectoryHandle('attachments');
                        for (const att of procedureToDelete.attachments) {
                            await attachmentsDir.removeEntry(att.originalFileName);
                        }
                        // Opcjonalnie: usuń folder 'attachments' jeśli jest pusty
                        // await categoryDir.removeEntry('attachments'); 
                    } catch (e) {
                        console.warn('Błąd podczas usuwania załączników:', e);
                    }
                }

            }
            
            // Usuń z lokalnej mapy
            this.procedures.delete(key);
            
            this.showMessage('Procedura została usunięta', 'success');
            this.renderProcedures();
        } catch (error) {
            console.error('Błąd podczas usuwania:', error);
            this.showMessage('Błąd podczas usuwania procedury: ' + error.message, 'error');
        }
    }

    // Obsługa wyszukiwania i filtrowania
    handleSearch(searchTerm) {
        this.searchTerm = searchTerm.trim();
        if (this.searchTerm === '') {
            this.isSearching = false;
            this.renderCategories(); // Wróć do widoku kategorii, jeśli wyszukiwanie jest puste
        } else {
            this.isSearching = true;
            this.currentCategoryView = null; // Wyłącz widok kategorii
            this.renderSearchResults();
        }
    }

    handleFilter(category) {
        // Jeśli wybrana kategoria jest pusta (opcja "Wszystkie kategorie"), wróć do widoku kategorii
        if (category === '') {
            this.renderCategories();
        } else {
            // W przeciwnym razie, przejdź do widoku procedur dla wybranej kategorii
            this.renderCategoryProcedures(category);
        }
    }

    switchView(view) {
        this.currentView = view;
        
        // Aktualizuj przyciski
        document.getElementById('btn-view-current').classList.toggle('active', view === 'current');
        document.getElementById('btn-view-archive').classList.toggle('active', view === 'archive');
        
        this.renderCategories(); // Zawsze wracaj do widoku kategorii po zmianie widoku
    }

    // Obsługa klawiatury
    handleKeyboard(e) {
        if (e.key === 'Escape') {
            this.closeModals();
        }
        
        if (e.ctrlKey && e.key === 'f') {
            e.preventDefault();
            document.getElementById('search-input').focus();
        }
    }

    // Funkcje pomocnicze
    showLoading(show) {
        document.getElementById('loading').style.display = show ? 'block' : 'none';
        // Zmieniamy widoczność w zależności od tego, co jest renderowane
        if (this.currentCategoryView || this.isSearching) { // Dodano isSearching
            document.getElementById('procedures-list').style.display = show ? 'none' : 'grid';
            document.getElementById('category-list').style.display = 'none';
        } else {
            document.getElementById('procedures-list').style.display = 'none';
            document.getElementById('category-list').style.display = show ? 'none' : 'grid';
        }
    }

    showMessage(message, type = 'info') {
        // Usuń poprzednie wiadomości
        const existingMessages = document.querySelectorAll('.message');
        existingMessages.forEach(msg => msg.remove());
        
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${type}-message`;
        messageDiv.textContent = message;
        
        const main = document.querySelector('main');
        main.insertBefore(messageDiv, main.firstChild);
        
        // Automatycznie usuń wiadomość po 5 sekundach
        setTimeout(() => {
            if (messageDiv.parentNode) {
                messageDiv.remove();
            }
        }, 5000);
    }

    getCategoryDisplayName(category) {
        return this.categories[category] || category;
    }

    updateCategoryDropdowns() {
        const categorySelects = document.querySelectorAll('#procedure-category, #category-filter');
        categorySelects.forEach(select => {
            select.innerHTML = '<option value="">Wybierz kategorię</option>';
            if (select.id === 'category-filter') {
                select.innerHTML = '<option value="">Wszystkie kategorie</option>';
            }
            const sortedCategories = Object.keys(this.categories).sort((a, b) => this.categories[a].localeCompare(this.categories[b]));
            sortedCategories.forEach(key => {
                const option = document.createElement('option');
                option.value = key;
                option.textContent = this.categories[key];
                select.appendChild(option);
            });
        });
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatDate(date) {
        return date.toLocaleDateString('pl-PL', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    showMoveDialog(originalFileName, category) {
        // Utwórz modal do przenoszenia procedury
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'move-modal';
        modal.innerHTML = `
            <div class="modal-content">
                <span class="close">&times;</span>
                <h2>Przenieś Procedurę</h2>
                <p>Przenieś procedurę "${originalFileName}" do innej kategorii:</p>
                <form id="move-form">
                    <div class="form-group">
                        <label for="move-category">Wybierz nową kategorię:</label>
                        <select id="move-category" required>
                            <option value="">Wybierz kategorię</option>
                        </select>
                    </div>
                    <div class="form-actions">
                        <button type="submit" class="btn btn-primary">Przenieś</button>
                        <button type="button" id="btn-move-cancel" class="btn btn-secondary">Anuluj</button>
                    </div>
                </form>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Wypełnij dropdown kategoriami (z wyłączeniem aktualnej kategorii)
        const categorySelect = document.getElementById('move-category');
        Object.keys(this.categories).forEach(key => {
            if (key !== category) { // Wyklucz aktualną kategorię
                const option = document.createElement('option');
                option.value = key;
                option.textContent = this.categories[key];
                categorySelect.appendChild(option);
            }
        });
        
        // Obsługa zamykania modala
        const closeBtn = modal.querySelector('.close');
        const cancelBtn = document.getElementById('btn-move-cancel');
        
        const closeModal = () => {
            modal.remove();
        };
        
        closeBtn.addEventListener('click', closeModal);
        cancelBtn.addEventListener('click', closeModal);
        
        // Zamknij modal po kliknięciu poza nim
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
        
        // Obsługa formularza
        document.getElementById('move-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const newCategory = categorySelect.value;
            
            if (newCategory && newCategory !== category) {
                this.moveProcedure(originalFileName, category, newCategory);
                closeModal();
            } else {
                this.showMessage('Wybierz inną kategorię niż aktualna.', 'error');
            }
        });
        
        // Pokaż modal
        modal.style.display = 'block';
    }

    async moveProcedure(originalFileName, fromCategory, toCategory) {
        try {
            const key = `${fromCategory}/${originalFileName}/current`;
            const procedure = this.procedures.get(key);
            
            if (!procedure) {
                this.showMessage('Nie znaleziono procedury', 'error');
                return;
            }
            
            if ('showDirectoryPicker' in window && this.directoryHandle) {
                const proceduresDir = await this.directoryHandle.getDirectoryHandle('procedury');
                const fromCategoryDir = await proceduresDir.getDirectoryHandle(fromCategory);
                const toCategoryDir = await proceduresDir.getDirectoryHandle(toCategory);

                const fileHandle = await fromCategoryDir.getFileHandle(originalFileName);
                const file = await fileHandle.getFile();

                // Kopiuj plik do nowej kategorii
                const newFileHandle = await toCategoryDir.getFileHandle(originalFileName, { create: true });
                const writable = await newFileHandle.createWritable();
                await writable.write(file);
                await writable.close();

                // Przenieś plik opisu i załączników, jeśli istnieją
                try {
                    const jsonFileName = originalFileName + '.json';
                    const jsonFileHandle = await fromCategoryDir.getFileHandle(jsonFileName);
                    const jsonFile = await jsonFileHandle.getFile();
                    const newJsonFileHandle = await toCategoryDir.getFileHandle(jsonFileName, { create: true });
                    const writableJson = await newJsonFileHandle.createWritable();
                    await writableJson.write(jsonFile);
                    await writableJson.close();
                    await fromCategoryDir.removeEntry(jsonFileName);

                    // Przenieś załączniki
                    const jsonData = JSON.parse(await jsonFile.text());
                    if (jsonData.attachments && jsonData.attachments.length > 0) {
                        const oldAttachmentsDir = await fromCategoryDir.getDirectoryHandle('attachments');
                        const newAttachmentsDir = await toCategoryDir.getDirectoryHandle('attachments', { create: true });
                        for (const att of jsonData.attachments) {
                            const attFileHandle = await oldAttachmentsDir.getFileHandle(att.originalFileName);
                            const attFile = await attFileHandle.getFile();
                            const newAttFileHandle = await newAttachmentsDir.getFileHandle(att.originalFileName, { create: true });
                            const newAttWritable = await newAttFileHandle.createWritable();
                            await newAttWritable.write(attFile);
                            await newAttWritable.close();
                            await oldAttachmentsDir.removeEntry(att.originalFileName);
                        }
                    }

                } catch (e) {
                    // Plik json lub folder załączników mógł nie istnieć, ignoruj błąd
                    console.warn('Błąd podczas przenoszenia metadanych/załączników:', e);
                }

                // Usuń plik ze starej kategorii
                await fromCategoryDir.removeEntry(originalFileName);

            } else {
                // Symulacja przenoszenia (w rzeczywistej implementacji należałoby przenieść plik)
                this.procedures.delete(key);
                const newKey = `${toCategory}/${originalFileName}/current`;
                this.procedures.set(newKey, { ...procedure, category: toCategory });
            }
            
            this.showMessage(`Procedura została przeniesiona do kategorii ${this.getCategoryDisplayName(toCategory)}`, 'success');
            this.refreshProcedures(); // Odśwież listę procedur po przeniesieniu
        } catch (error) {
            console.error('Błąd podczas przenoszenia:', error);
            this.showMessage('Błąd podczas przenoszenia procedury: ' + error.message, 'error');
        }
    }
}

// Inicjalizacja aplikacji
let procedureManager;

document.addEventListener('DOMContentLoaded', () => {
    procedureManager = new ProcedureManager();
});




        document.getElementById("btn-add-attachments").addEventListener("click", () => {
            document.getElementById("attachments-container").style.display = "block";
            document.getElementById("btn-add-attachments").style.display = "none";
        });

        document.getElementById("btn-details-add-attachments").addEventListener("click", () => {
            document.getElementById("details-attachments-container").style.display = "block";
            document.getElementById("btn-details-add-attachments").style.display = "none";
        });
