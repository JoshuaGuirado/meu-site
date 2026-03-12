import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AuthState, Category, Product } from "../types";
import {
  LayoutDashboard,
  Package,
  Plus,
  LogOut,
  Trash2,
  Edit3,
  BarChart3,
  ExternalLink,
  MousePointer2,
  Check,
  Menu,
  X,
  Image as ImageIcon,
  Settings,
  Calendar,
  Clock,
  Filter,
  Tag,
  GripVertical,
  AlertTriangle,
  User as UserIcon,
  Shield,
  Zap,
  FileSpreadsheet,
  UploadCloud,
  CheckCircle,
  XCircle,
  ArrowRight,
  Save,
  Loader2,
  PartyPopper
} from "lucide-react";
import * as XLSX from "xlsx";
import confetti from "canvas-confetti";
import { motion, AnimatePresence } from "motion/react";
import { useForm } from "react-hook-form";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

interface AdminDashboardProps {
  auth: AuthState;
  onLogout: () => void;
  categories: Category[];
  onRefreshCategories: () => void;
}

interface SortableSubcategoryProps {
  sub: any;
  onEdit: (id: number, name: string) => Promise<void> | void;
  onDelete: (id: number) => Promise<void> | void;
}

function SortableSubcategory({ sub, onEdit, onDelete }: any) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: sub.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between bg-white px-3 py-2 rounded-lg border border-neutral-100 group ${isDragging ? "shadow-lg border-brand opacity-50" : ""}`}
    >
      <div className="flex items-center gap-2 flex-1">
        <button
          {...attributes}
          {...listeners}
          className="p-1 text-neutral-300 hover:text-neutral-500 cursor-grab active:cursor-grabbing"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
        <span className="text-xs font-medium text-neutral-600">{sub.name}</span>
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(sub.id, sub.name)}
          className="p-1 text-neutral-400 hover:text-brand"
        >
          <Edit3 className="w-3 h-3" />
        </button>
        <button
          onClick={() => onDelete(sub.id)}
          className="p-1 text-neutral-400 hover:text-red-500"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}

interface Stats {
  totalProducts: number;
  totalClicks: number;
  topProducts: { name: string; clicks: number }[];
}

export type BatchImportRow = {
  id: string;
  originalUrl: string;
  affiliateUrl: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  errorDetails?: string;
  scrapedData?: any;
};

export default function AdminDashboard({ auth, onLogout, categories, onRefreshCategories }: AdminDashboardProps) {
  const [activeTab, setActiveTab] = useState<"stats" | "products" | "add" | "categories" | "users">("stats");
  const [stats, setStats] = useState<Stats | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserData, setNewUserData] = useState({ name: '', email: '', password: '' });
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [statsFilters, setStatsFilters] = useState({
    start: "",
    end: "",
    category_id: "",
    subcategory_id: ""
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isScraping, setIsScraping] = useState(false);
  const [importNormalUrl, setImportNormalUrl] = useState("");
  const [importAffiliateUrl, setImportAffiliateUrl] = useState("");
  const [affiliateLinks, setAffiliateLinks] = useState<{ store: string; url: string }[]>([{ store: "Principal", url: "" }]);
  const [productsSearchTerm, setProductsSearchTerm] = useState("");

  // Batch Import States
  const [importMode, setImportMode] = useState<"single" | "batch">("single");
  const [batchQueue, setBatchQueue] = useState<BatchImportRow[]>([]);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);
  const [selectedBatchItemIds, setSelectedBatchItemIds] = useState<Set<string>>(new Set());
  const [editingBatchItem, setEditingBatchItem] = useState<BatchImportRow | null>(null);
  const [successModal, setSuccessModal] = useState<{ isOpen: boolean, message: string }>({ isOpen: false, message: "" });
  const [importErrorLog, setImportErrorLog] = useState<{ url: string; reason: string; time: string }[]>([]);

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean;
    title: string;
    message?: string;
    type: 'prompt' | 'confirm' | 'alert';
    inputValue?: string;
    onConfirm?: (val?: string) => void;
  }>({ isOpen: false, title: '', type: 'alert' });

  const navigate = useNavigate();

  const showAlert = (title: string, message?: string) => {
    setModalConfig({ isOpen: true, title, message, type: 'alert' });
  };

  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setModalConfig({ isOpen: true, title, message, type: 'confirm', onConfirm });
  };

  const showPrompt = (title: string, defaultValue: string, onConfirm: (val: string) => void) => {
    setModalConfig({ isOpen: true, title, type: 'prompt', inputValue: defaultValue, onConfirm });
  };

  const closeModal = () => setModalConfig({ ...modalConfig, isOpen: false });

  const triggerSuccess = (message: string) => {
    setSuccessModal({ isOpen: true, message });
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'],
      zIndex: 9999
    });
    setTimeout(() => {
      setSuccessModal({ isOpen: false, message: "" });
      setActiveTab("products");
    }, 4000); // closes after 4 seconds automatically
  };

  const { register, handleSubmit, reset, watch, setValue } = useForm();
  const selectedCategoryId = watch("category_id");

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    if (!auth.token) {
      navigate("/admin/login");
      return;
    }
    fetchStats();
    fetchProducts();
    fetchUsers();
  }, [auth.token, statsFilters, categories]);

  const downloadTemplate = () => {
    const ws = XLSX.utils.json_to_sheet([{ link_afiliado: "https://amzn.to/exemplo", link_pagina: "https://amazon.com/exemplo" }]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Modelo");
    XLSX.writeFile(wb, "modelo_importacao.xlsx");
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: "binary" });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json<any>(ws);

        const newQueue: BatchImportRow[] = data
          .filter(row => row.link_pagina && row.link_afiliado)
          .map((row) => ({
            id: Math.random().toString(36).substring(7),
            originalUrl: row.link_pagina.trim(),
            affiliateUrl: row.link_afiliado.trim(),
            status: 'pending'
          }));

        if (newQueue.length === 0) {
          showAlert("Aviso", "A planilha não contém as colunas 'link_afiliado' e 'link_pagina' validas.");
        } else {
          setBatchQueue(prev => [...prev, ...newQueue]);
        }
        if (e.target) e.target.value = ''; // Reset input
      } catch (err) {
        showAlert("Erro", "Falha ao ler o arquivo. Use o modelo fornecido.");
      }
    };
    reader.readAsBinaryString(file);
  };

  const processBatchItem = async (index: number) => {
    const item = batchQueue[index];
    if (!item || item.status !== 'pending') return;

    setBatchQueue(prev => {
      const n = [...prev];
      n[index] = { ...n[index], status: 'processing' };
      return n;
    });

    try {
      const isDup = products.some(p => {
        try {
          const parsed = JSON.parse(p.link_afiliado);
          if (Array.isArray(parsed)) return parsed.some((link: any) => link.url === item.affiliateUrl || link.url === item.originalUrl);
          return p.link_afiliado === item.affiliateUrl || p.link_afiliado === item.originalUrl;
        } catch {
          return p.link_afiliado === item.affiliateUrl || p.link_afiliado === item.originalUrl;
        }
      });

      if (isDup) throw new Error("Duplicado na base");

      const res = await fetch("/api/admin/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ url: item.originalUrl, categories })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro ao extrair");

      if (!data.name || !data.price || !data.category_id || !data.subcategory_id) {
        throw new Error("Dados incompletos");
      }

      setBatchQueue(prev => {
        const n = [...prev];
        n[index] = {
          ...n[index],
          status: 'success',
          scrapedData: {
            name: data.name,
            price: data.price,
            price_original: data.price_original || 0,
            description: data.description || "",
            image: data.image || "",
            keywords: data.keywords || "",
            category_id: data.category_id,
            subcategory_id: data.subcategory_id,
            featured: 0,
            tag_label: "",
            tag_color: "",
            link_afiliado: JSON.stringify([{ store: data.marketplace || "Principal", url: item.affiliateUrl }])
          }
        };
        return n;
      });

    } catch (err: any) {
      // Log the error and remove immediately from queue
      const failedUrl = batchQueue[index]?.originalUrl || "URL desconhecida";
      setImportErrorLog(prev => [...prev, {
        url: failedUrl,
        reason: err.message || "Erro desconhecido",
        time: new Date().toLocaleTimeString("pt-BR")
      }]);
      // Remove the failed item from the queue
      setBatchQueue(prev => prev.filter((_, i) => i !== index));
    }
  };

  useEffect(() => {
    if (isBatchProcessing) {
      const nextIndex = batchQueue.findIndex(i => i.status === 'pending');
      if (nextIndex !== -1) {
        // Add a small delay to avoid being blocked
        const timer = setTimeout(() => {
          processBatchItem(nextIndex);
        }, 1200);
        return () => clearTimeout(timer);
      } else {
        setIsBatchProcessing(false);
        showAlert("Concluído", "A fila de importação foi finalizada.");
      }
    }
  }, [isBatchProcessing, batchQueue]);

  const removeBatchItems = () => {
    setBatchQueue(prev => prev.filter(i => !selectedBatchItemIds.has(i.id)));
    setSelectedBatchItemIds(new Set());
  };

  const publishBatchItems = async () => {
    const itemsToPublish = batchQueue.filter(i => i.status === 'success' && i.scrapedData);
    if (itemsToPublish.length === 0) return;

    let successCount = 0;
    for (const item of itemsToPublish) {
      try {
        const res = await fetch("/api/products", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` },
          body: JSON.stringify(item.scrapedData)
        });
        if (res.ok) successCount++;
      } catch (e) { }
    }
    fetchProducts();
    setBatchQueue(prev => prev.filter(i => i.status !== 'success'));
    setSelectedBatchItemIds(new Set());
    triggerSuccess(`MAGIA PURA! ${successCount} produtos foram para o ar com sucesso! 🚀`);
  };

  const fetchUsers = async () => {
    const res = await fetch("/api/admin/users", {
      headers: { Authorization: `Bearer ${auth.token}` }
    });
    if (res.ok) setAdminUsers(await res.json());
  };

  const toggleAdmin = async (id: number, currentStatus: boolean) => {
    const res = await fetch(`/api/admin/users/${id}/toggle-admin`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify({ is_admin: !currentStatus })
    });
    if (res.ok) {
      fetchUsers();
    } else {
      const data = await res.json();
      showAlert("Erro", data.error || "Erro ao alterar permissão");
    }
  };

  const handleCreateAdminUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserData.name || !newUserData.email || !newUserData.password) {
      showAlert("Erro", "Preencha todos os campos para cadastrar o usuário.");
      return;
    }

    const res = await fetch("/api/admin/users/create", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify(newUserData)
    });

    if (res.ok) {
      setNewUserData({ name: '', email: '', password: '' });
      setShowAddUser(false);
      fetchUsers();
      showAlert("Sucesso", "Usuário administrador criado com sucesso!");
    } else {
      const data = await res.json();
      showAlert("Erro", data.error || "Erro ao criar usuário.");
    }
  };

  const fetchStats = async () => {
    const params = new URLSearchParams();
    if (statsFilters.start) params.set("start", statsFilters.start);
    if (statsFilters.end) params.set("end", statsFilters.end);
    if (statsFilters.category_id) params.set("category_id", statsFilters.category_id);
    if (statsFilters.subcategory_id) params.set("subcategory_id", statsFilters.subcategory_id);

    const res = await fetch(`/api/stats?${params.toString()}`, {
      headers: { Authorization: `Bearer ${auth.token}` }
    });
    if (res.ok) setStats(await res.json());
  };

  const fetchProducts = async () => {
    const res = await fetch("/api/products");
    if (res.ok) setProducts(await res.json());
  };

  const isDuplicateUrl = useMemo(() => {
    const urlToCheck = importAffiliateUrl.trim() || importNormalUrl.trim();
    if (!urlToCheck) return false;

    return products.some(p => {
      try {
        const parsed = JSON.parse(p.link_afiliado);
        if (Array.isArray(parsed)) {
          return parsed.some((link: any) => link.url === urlToCheck);
        }
        return p.link_afiliado === urlToCheck;
      } catch {
        return p.link_afiliado === urlToCheck;
      }
    });
  }, [importAffiliateUrl, importNormalUrl, products]);

  const handleScrape = async () => {
    if (!importNormalUrl) {
      showAlert("Erro", "Você precisa fornecer o link original do produto para a busca.");
      return;
    }
    setIsScraping(true);
    try {
      const res = await fetch("/api/admin/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${auth.token}`
        },
        body: JSON.stringify({ url: importNormalUrl, categories })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao importar");

      setValue("name", data.name || "");
      if (data.price) setValue("price", data.price);
      if (data.price_original) setValue("price_original", data.price_original);
      setValue("description", data.description || "");
      if (data.image) setValue("image", data.image);
      if (data.keywords) setValue("keywords", data.keywords);
      if (data.category_id) {
        setValue("category_id", data.category_id);
        // Delay subcategory setting so that the <select> options have time to render based on the new category_id
        if (data.subcategory_id) {
          setTimeout(() => {
            setValue("subcategory_id", data.subcategory_id);
          }, 100);
        }
      }

      const definitiveUrl = importAffiliateUrl || importNormalUrl;
      const newLinks = [...(affiliateLinks.filter(l => l.url.trim() !== ""))];
      if (newLinks.length === 0) {
        newLinks.push({ store: data.marketplace || "Principal", url: definitiveUrl });
      } else {
        newLinks[0].url = definitiveUrl;
        newLinks[0].store = data.marketplace || "Principal";
      }
      setAffiliateLinks(newLinks);

      if (data.marketplace) {
        setValue("tag_label", data.marketplace);
        // Default colors for common marketplaces
        const colors: Record<string, string> = {
          'Amazon': '#f59e0b',
          'Shopee': '#f97316',
          'Mercado Livre': '#ef4444',
          'AliExpress': '#ef4444',
          'Magalu': '#3b82f6'
        };
        if (colors[data.marketplace]) setValue("tag_color", colors[data.marketplace]);
      }

      setImportNormalUrl("");
      setImportAffiliateUrl("");

      showAlert("Importação concluída", "Verifique os dados importados, ajuste se necessário e salve o produto.");
    } catch (err: any) {
      showAlert("Erro na Importação", err.message);
    } finally {
      setIsScraping(false);
    }
  };

  const onSubmit = async (data: any) => {
    const url = editingProduct ? `/api/products/${editingProduct.id}` : "/api/products";
    const method = editingProduct ? "PUT" : "POST";

    const validLinks = affiliateLinks.filter(l => l.url.trim() !== "");
    if (validLinks.length > 1) {
      data.link_afiliado = JSON.stringify(validLinks);
    } else if (validLinks.length === 1) {
      data.link_afiliado = validLinks[0].url;
    } else {
      data.link_afiliado = ""; // Or required validation
    }

    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth.token}`
      },
      body: JSON.stringify(data),
    });

    if (res.ok) {
      reset();
      setAffiliateLinks([{ store: "Principal", url: "" }]);
      setEditingProduct(null);
      fetchProducts();
      fetchStats();
      triggerSuccess(editingProduct ? "Alterações gravadas perfeitamente! 💫" : "BINGO! Produto na vitrine! 🎉");
    }
  };

  const deleteProduct = async (id: number) => {
    showConfirm("Excluir Produto", "Tem certeza que deseja excluir este produto?", async () => {
      const res = await fetch(`/api/products/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${auth.token}` }
      });
      if (res.ok) {
        fetchProducts();
        fetchStats();
      }
    });
  };

  const handleAddCategory = async (name: string) => {
    const res = await fetch("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify({ name })
    });
    if (res.ok) {
      onRefreshCategories();
    } else {
      const data = await res.json();
      showAlert("Erro", data.error || "Erro ao adicionar categoria");
    }
  };

  const handleEditCategory = async (id: number, name: string) => {
    const res = await fetch(`/api/categories/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify({ name })
    });
    if (res.ok) {
      onRefreshCategories();
    } else {
      const data = await res.json();
      showAlert("Erro", data.error || "Erro ao editar categoria");
    }
  };

  const handleDeleteCategory = async (id: number) => {
    showConfirm("Excluir Categoria", "Isso excluirá todos os produtos desta categoria. Continuar?", async () => {
      const res = await fetch(`/api/categories/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${auth.token}` }
      });
      if (res.ok) {
        onRefreshCategories();
      } else {
        const data = await res.json();
        showAlert("Erro", data.error || "Erro ao excluir categoria");
      }
    });
  };

  const handleAddSubcategory = async (name: string, category_id: number) => {
    const res = await fetch("/api/subcategories", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify({ name, category_id })
    });
    if (res.ok) {
      onRefreshCategories();
    } else {
      const data = await res.json();
      showAlert("Erro", data.error || "Erro ao adicionar subcategoria");
    }
  };

  const handleEditSubcategory = async (id: number, name: string) => {
    const res = await fetch(`/api/subcategories/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` },
      body: JSON.stringify({ name })
    });
    if (res.ok) {
      onRefreshCategories();
    } else {
      const data = await res.json();
      showAlert("Erro", data.error || "Erro ao editar subcategoria");
    }
  };

  const handleDeleteSubcategory = async (id: number) => {
    showConfirm("Excluir Subcategoria", "Isso excluirá todos os produtos desta subcategoria. Continuar?", async () => {
      const res = await fetch(`/api/subcategories/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${auth.token}` }
      });
      if (res.ok) {
        onRefreshCategories();
      } else {
        const data = await res.json();
        showAlert("Erro", data.error || "Erro ao excluir subcategoria");
      }
    });
  };

  const handleDragEnd = async (event: DragEndEvent, categoryId: number) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const category = categories.find(c => c.id === categoryId);
      if (!category) return;

      const oldIndex = category.subcategories.findIndex(s => s.id === active.id);
      const newIndex = category.subcategories.findIndex(s => s.id === over.id);

      const newSubcategories = arrayMove(category.subcategories, oldIndex, newIndex);

      // Optimistic update
      // (Wait for refresh from server for full sync)

      const reorderData = newSubcategories.map((sub, index) => ({
        id: sub.id,
        order_index: index
      }));

      const res = await fetch("/api/subcategories/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ subcategories: reorderData })
      });

      if (res.ok) {
        onRefreshCategories();
      }
    }
  };

  const startEdit = (product: Product) => {
    setEditingProduct(product);
    setValue("name", product.name);
    setValue("description", product.description);
    setValue("image", product.image);
    setValue("price", product.price);
    setValue("price_original", product.price_original);
    setValue("keywords", product.keywords);

    let parsedLinks = [{ store: "Principal", url: product.link_afiliado }];
    try {
      const parsed = JSON.parse(product.link_afiliado);
      if (Array.isArray(parsed)) parsedLinks = parsed;
    } catch { }
    setAffiliateLinks(parsedLinks);

    setValue("category_id", product.category_id);
    setValue("subcategory_id", product.subcategory_id);
    setValue("featured", product.featured === 1);
    setValue("tag_label", product.tag_label);
    setValue("tag_color", product.tag_color);
    setActiveTab("add");
  };

  const selectedCategory = categories.find(c => c.id.toString() === selectedCategoryId?.toString());

  return (
    <div className="min-h-screen bg-neutral-50 flex font-sans">
      {/* Sidebar */}
      <motion.aside
        initial={false}
        animate={{ width: isSidebarOpen ? 256 : 80 }}
        className="bg-brand text-white flex flex-col sticky top-0 h-screen overflow-hidden shrink-0 z-50"
      >
        <div className="p-6 flex items-center gap-3 h-20">
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center shrink-0 transition-colors"
          >
            {isSidebarOpen ? <X className="w-5 h-5 text-white" /> : <Menu className="w-5 h-5 text-white" />}
          </button>
          <AnimatePresence>
            {isSidebarOpen && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                className="font-black text-lg tracking-tight whitespace-nowrap overflow-hidden"
              >
                AdminHub
              </motion.span>
            )}
          </AnimatePresence>
        </div>

        <nav className="flex-1 px-4 space-y-2 overflow-y-auto overflow-x-hidden no-scrollbar">
          <button
            onClick={() => { setActiveTab("stats"); setEditingProduct(null); }}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all text-sm font-bold ${activeTab === "stats" ? "bg-white/10 text-white" : "text-neutral-400 hover:text-white hover:bg-white/5"}`}
            title={!isSidebarOpen ? "Painel de Gestão" : undefined}
          >
            <div className="shrink-0 flex items-center justify-center w-6">
              <LayoutDashboard className="w-5 h-5" />
            </div>
            <AnimatePresence>
              {isSidebarOpen && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  className="whitespace-nowrap overflow-hidden"
                >
                  Painel de Gestão
                </motion.span>
              )}
            </AnimatePresence>
          </button>
          <button
            onClick={() => { setActiveTab("products"); setEditingProduct(null); }}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all text-sm font-bold ${activeTab === "products" ? "bg-white/10 text-white" : "text-neutral-400 hover:text-white hover:bg-white/5"}`}
            title={!isSidebarOpen ? "Produtos" : undefined}
          >
            <div className="shrink-0 flex items-center justify-center w-6">
              <Package className="w-5 h-5" />
            </div>
            <AnimatePresence>
              {isSidebarOpen && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  className="whitespace-nowrap overflow-hidden"
                >
                  Produtos
                </motion.span>
              )}
            </AnimatePresence>
          </button>
          <button
            onClick={() => { setActiveTab("categories"); setEditingProduct(null); }}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all text-sm font-bold ${activeTab === "categories" ? "bg-white/10 text-white" : "text-neutral-400 hover:text-white hover:bg-white/5"}`}
            title={!isSidebarOpen ? "Categorias" : undefined}
          >
            <div className="shrink-0 flex items-center justify-center w-6">
              <Settings className="w-5 h-5" />
            </div>
            <AnimatePresence>
              {isSidebarOpen && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  className="whitespace-nowrap overflow-hidden"
                >
                  Categorias
                </motion.span>
              )}
            </AnimatePresence>
          </button>
          <button
            onClick={() => { setActiveTab("users"); setEditingProduct(null); }}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all text-sm font-bold ${activeTab === "users" ? "bg-white/10 text-white" : "text-neutral-400 hover:text-white hover:bg-white/5"}`}
            title={!isSidebarOpen ? "Acessos" : undefined}
          >
            <div className="shrink-0 flex items-center justify-center w-6">
              <Shield className="w-5 h-5" />
            </div>
            <AnimatePresence>
              {isSidebarOpen && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  className="whitespace-nowrap overflow-hidden"
                >
                  Acessos
                </motion.span>
              )}
            </AnimatePresence>
          </button>
          <button
            onClick={() => { setActiveTab("add"); setEditingProduct(null); setAffiliateLinks([{ store: "Principal", url: "" }]); reset(); }}
            className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl transition-all text-sm font-bold ${activeTab === "add" ? "bg-white/10 text-white" : "text-neutral-400 hover:text-white hover:bg-white/5"}`}
            title={!isSidebarOpen ? (editingProduct ? "Editar Produto" : "Novo Produto") : undefined}
          >
            <div className="shrink-0 flex items-center justify-center w-6">
              <Plus className="w-5 h-5" />
            </div>
            <AnimatePresence>
              {isSidebarOpen && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  className="whitespace-nowrap overflow-hidden"
                >
                  {editingProduct ? "Editar Produto" : "Novo Produto"}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </nav>

        <div className="p-4 mt-auto border-t border-white/10">
          <div className="flex items-center gap-3 px-2 py-3 mb-4">
            <div className="w-8 h-8 bg-neutral-800 rounded-full flex items-center justify-center text-xs font-bold shrink-0">
              {auth.user?.name[0]}
            </div>
            <AnimatePresence>
              {isSidebarOpen && (
                <motion.div
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  className="flex flex-col overflow-hidden whitespace-nowrap"
                >
                  <span className="text-sm font-bold truncate max-w-[120px]">{auth.user?.name}</span>
                  <span className="text-[10px] text-neutral-500 uppercase tracking-widest">Administrador</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-400/10 transition-all text-sm font-bold"
            title={!isSidebarOpen ? "Sair" : undefined}
          >
            <div className="shrink-0 flex items-center justify-center w-6">
              <LogOut className="w-5 h-5" />
            </div>
            <AnimatePresence>
              {isSidebarOpen && (
                <motion.span
                  initial={{ opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: "auto" }}
                  exit={{ opacity: 0, width: 0 }}
                  className="whitespace-nowrap overflow-hidden"
                >
                  Sair
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto min-w-0">
        <header className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-neutral-900">
              {activeTab === "stats" && "Painel de Gestão"}
              {activeTab === "products" && "Gerenciar Produtos"}
              {activeTab === "categories" && "Gerenciar Categorias"}
              {activeTab === "users" && "Controle de Acessos"}
              {activeTab === "add" && (editingProduct ? "Editar Produto" : "Adicionar Novo Produto")}
            </h1>
            <p className="text-neutral-500 mt-1">
              Bem-vindo de volta, {auth.user?.name}. Aqui está o que está acontecendo hoje.
            </p>
          </div>
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-2 bg-white border border-neutral-200 px-4 py-2 rounded-xl text-sm font-bold hover:bg-neutral-50 transition-all shadow-sm"
          >
            <ExternalLink className="w-4 h-4" />
            Ver Site
          </button>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === "stats" && stats && (
            <motion.div
              key="stats"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              {/* Stats Filters */}
              <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <Filter className="w-5 h-5 text-brand" />
                  <h2 className="font-bold text-sm uppercase tracking-widest text-neutral-400">Filtros de Gestão</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest ml-1">Início</label>
                    <input
                      type="datetime-local"
                      value={statsFilters.start}
                      onChange={(e) => setStatsFilters({ ...statsFilters, start: e.target.value })}
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-xl py-2 px-3 text-xs focus:ring-2 focus:ring-brand/5 focus:border-brand outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest ml-1">Fim</label>
                    <input
                      type="datetime-local"
                      value={statsFilters.end}
                      onChange={(e) => setStatsFilters({ ...statsFilters, end: e.target.value })}
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-xl py-2 px-3 text-xs focus:ring-2 focus:ring-brand/5 focus:border-brand outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest ml-1">Categoria</label>
                    <select
                      value={statsFilters.category_id}
                      onChange={(e) => setStatsFilters({ ...statsFilters, category_id: e.target.value, subcategory_id: "" })}
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-xl py-2 px-3 text-xs focus:ring-2 focus:ring-brand/5 focus:border-brand outline-none"
                    >
                      <option value="">Todas</option>
                      {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest ml-1">Subcategoria</label>
                    <select
                      value={statsFilters.subcategory_id}
                      onChange={(e) => setStatsFilters({ ...statsFilters, subcategory_id: e.target.value })}
                      disabled={!statsFilters.category_id}
                      className="w-full bg-neutral-50 border border-neutral-200 rounded-xl py-2 px-3 text-xs focus:ring-2 focus:ring-brand/5 focus:border-brand outline-none disabled:opacity-50"
                    >
                      <option value="">Todas</option>
                      {categories.find(c => c.id.toString() === statsFilters.category_id)?.subcategories.map(s => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                {(statsFilters.start || statsFilters.end || statsFilters.category_id) && (
                  <button
                    onClick={() => setStatsFilters({ start: "", end: "", category_id: "", subcategory_id: "" })}
                    className="mt-4 text-[10px] font-bold text-brand hover:underline"
                  >
                    Limpar Filtros
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm">
                  <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mb-4">
                    <Package className="w-6 h-6" />
                  </div>
                  <p className="text-neutral-500 text-sm font-medium">Total de Produtos</p>
                  <p className="text-4xl font-black mt-1">{stats.totalProducts}</p>
                </div>
                <div className="bg-white p-6 rounded-3xl border border-neutral-200 shadow-sm">
                  <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mb-4">
                    <MousePointer2 className="w-6 h-6" />
                  </div>
                  <p className="text-neutral-500 text-sm font-medium">Cliques Totais</p>
                  <p className="text-4xl font-black mt-1">{stats.totalClicks}</p>
                </div>
              </div>

              <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-neutral-100 flex items-center justify-between">
                  <h2 className="font-black text-lg">Produtos mais clicados</h2>
                  <BarChart3 className="w-5 h-5 text-neutral-400" />
                </div>
                <div className="p-6">
                  {stats.topProducts.length > 0 ? (
                    <div className="space-y-4">
                      {stats.topProducts.map((p, i) => (
                        <div key={i} className="flex items-center justify-between group">
                          <div className="flex items-center gap-4">
                            <span className="w-6 text-neutral-300 font-black text-xl italic">{i + 1}</span>
                            <span className="font-bold text-neutral-700 group-hover:text-brand transition-colors">{p.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="font-black text-lg">{p.clicks}</span>
                            <span className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">cliques</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-center py-8 text-neutral-400 text-sm">Nenhum dado de clique disponível ainda.</p>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "categories" && (
            <motion.div
              key="categories"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-8"
            >
              <div className="bg-white rounded-3xl border border-neutral-200 shadow-sm p-8">
                <div className="flex items-center justify-between mb-8">
                  <h2 className="text-xl font-black">Estrutura de Categorias</h2>
                  <button
                    onClick={() => {
                      showPrompt("Nova Categoria", "", (name) => {
                        if (name) handleAddCategory(name);
                      });
                    }}
                    className="bg-brand text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Nova Categoria
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {categories.map(cat => (
                    <div key={cat.id} className="bg-neutral-50 rounded-2xl p-6 border border-neutral-100">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-black text-brand">{cat.name}</h3>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              showPrompt("Editar Categoria", cat.name, (name) => {
                                if (name) handleEditCategory(cat.id, name);
                              });
                            }}
                            className="p-1.5 text-neutral-400 hover:text-brand transition-colors"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteCategory(cat.id)}
                            className="p-1.5 text-neutral-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={(event) => handleDragEnd(event, cat.id)}
                        >
                          <SortableContext
                            items={cat.subcategories.map(s => s.id)}
                            strategy={verticalListSortingStrategy}
                          >
                            <div className="space-y-2">
                              {cat.subcategories.map(sub => (
                                <SortableSubcategory
                                  key={sub.id}
                                  sub={sub}
                                  onEdit={(id: number, name: string) => {
                                    showPrompt("Editar Subcategoria", name, (newName) => {
                                      if (newName) handleEditSubcategory(id, newName);
                                    });
                                  }}
                                  onDelete={handleDeleteSubcategory}
                                />
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                        <button
                          onClick={() => {
                            showPrompt("Nova Subcategoria", "", (name) => {
                              if (name) handleAddSubcategory(name, cat.id);
                            });
                          }}
                          className="w-full py-2 border-2 border-dashed border-neutral-200 rounded-lg text-[10px] font-bold text-neutral-400 uppercase tracking-widest hover:border-brand hover:text-brand transition-all"
                        >
                          + Adicionar Sub
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "products" && (
            <motion.div
              key="products"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white rounded-3xl border border-neutral-200 shadow-sm overflow-hidden"
            >
              <div className="p-4 border-b border-neutral-200">
                <input
                  type="text"
                  placeholder="Pesquisar produtos (nome, categoria...)"
                  value={productsSearchTerm}
                  onChange={e => setProductsSearchTerm(e.target.value)}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-brand/5 focus:border-brand transition-all text-sm outline-none"
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-neutral-50 border-b border-neutral-100">
                      <th className="px-6 py-4 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Produto</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Categoria</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-neutral-400 uppercase tracking-widest text-center">Cliques</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-neutral-400 uppercase tracking-widest text-center">Destaque</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-neutral-400 uppercase tracking-widest text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-50">
                    {products
                      .filter(p => p.name.toLowerCase().includes(productsSearchTerm.toLowerCase()) || p.category_name?.toLowerCase().includes(productsSearchTerm.toLowerCase()))
                      .map(product => (
                        <tr key={product.id} className="hover:bg-neutral-50/50 transition-colors group">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <img src={product.image} className="w-10 h-10 rounded-lg object-contain bg-neutral-100 p-1" referrerPolicy="no-referrer" />
                              <div>
                                <p className="font-bold text-sm text-neutral-900 line-clamp-1">{product.name}</p>
                                <div className="flex items-center gap-2">
                                  {product.price_original && (
                                    <span className="text-[10px] text-neutral-400 line-through">R$ {product.price_original.toLocaleString("pt-BR")}</span>
                                  )}
                                  <p className="text-[10px] text-neutral-600 font-bold">R$ {product.price?.toLocaleString("pt-BR")}</p>
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-xs font-semibold text-neutral-600 bg-neutral-100 px-2 py-1 rounded-md">
                              {product.category_name}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="text-sm font-black text-neutral-700">{product.clicks}</span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            {product.featured === 1 ? (
                              <Check className="w-5 h-5 text-emerald-500 mx-auto" />
                            ) : (
                              <X className="w-5 h-5 text-neutral-200 mx-auto" />
                            )}
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => startEdit(product)}
                                className="p-2 text-neutral-400 hover:text-brand hover:bg-neutral-100 rounded-lg transition-all"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => deleteProduct(product.id)}
                                className="p-2 text-neutral-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === "users" && (
            <motion.div
              key="users"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="bg-white rounded-3xl border border-neutral-200 shadow-sm overflow-hidden p-8"
            >
              <div className="flex items-center justify-between mb-8">
                <div>
                  <h2 className="text-xl font-black">Usuários Autorizados</h2>
                  <p className="text-sm text-neutral-500 mt-1">Gerencie quem tem acesso ao painel administrativo (AdminHub).</p>
                </div>
                <button
                  onClick={() => setShowAddUser(!showAddUser)}
                  className="bg-brand text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-transform active:scale-95"
                >
                  {showAddUser ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                  {showAddUser ? "Cancelar" : "Novo Admin"}
                </button>
              </div>

              <AnimatePresence>
                {showAddUser && (
                  <motion.form
                    initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                    animate={{ opacity: 1, height: "auto", marginBottom: 32 }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    className="overflow-hidden"
                    onSubmit={handleCreateAdminUser}
                  >
                    <div className="bg-neutral-50 p-6 rounded-2xl border border-neutral-200">
                      <h3 className="font-bold text-neutral-800 mb-4 block text-sm">Cadastrar Novo Administrador</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <input
                            type="text"
                            placeholder="Nome Completo"
                            value={newUserData.name}
                            onChange={e => setNewUserData({ ...newUserData, name: e.target.value })}
                            className="w-full bg-white border border-neutral-200 rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-brand/10 focus:border-brand outline-none"
                          />
                        </div>
                        <div>
                          <input
                            type="email"
                            placeholder="E-mail"
                            value={newUserData.email}
                            onChange={e => setNewUserData({ ...newUserData, email: e.target.value })}
                            className="w-full bg-white border border-neutral-200 rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-brand/10 focus:border-brand outline-none"
                          />
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="password"
                            placeholder="Senha"
                            value={newUserData.password}
                            onChange={e => setNewUserData({ ...newUserData, password: e.target.value })}
                            className="w-full bg-white border border-neutral-200 rounded-xl py-2 px-3 text-sm focus:ring-2 focus:ring-brand/10 focus:border-brand outline-none"
                          />
                          <button type="submit" className="bg-emerald-600 text-white px-4 rounded-xl font-bold text-sm hover:bg-emerald-700 transition-colors whitespace-nowrap">
                            Salvar
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.form>
                )}
              </AnimatePresence>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-neutral-50 border-b border-neutral-100">
                      <th className="px-6 py-4 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Usuário</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-neutral-400 uppercase tracking-widest">E-mail</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-neutral-400 uppercase tracking-widest text-center">Admin</th>
                      <th className="px-6 py-4 text-[10px] font-bold text-neutral-400 uppercase tracking-widest text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-50">
                    {adminUsers.map(user => (
                      <tr key={user.id} className="hover:bg-neutral-50/50 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-brand/10 text-brand flex items-center justify-center font-bold text-xs">
                              {user.name.charAt(0)}
                            </div>
                            <span className="font-bold text-sm text-neutral-900">{user.name}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-sm text-neutral-600">{user.email}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          {user.is_admin === 1 ? (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">
                              Administrador
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-bold bg-neutral-100 text-neutral-600">
                              Usuário Comum
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className={`flex items-center justify-end gap-2 transition-opacity ${user.email === "topfinds.dj2@gmail.com" ? "opacity-30 cursor-not-allowed" : "opacity-0 group-hover:opacity-100"}`}>
                            {user.email !== "topfinds.dj2@gmail.com" && (
                              <button
                                onClick={() => {
                                  if (user.id === auth.user?.id) {
                                    showConfirm("Atenção", "Você está removendo seu próprio acesso. Deseja continuar?", () => toggleAdmin(user.id, user.is_admin === 1));
                                  } else {
                                    toggleAdmin(user.id, user.is_admin === 1);
                                  }
                                }}
                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${user.is_admin === 1 ? "bg-red-50 text-red-600 hover:bg-red-100" : "bg-emerald-50 text-emerald-600 hover:bg-emerald-100"}`}
                              >
                                {user.is_admin === 1 ? "Remover Acesso" : "Conceder Acesso"}
                              </button>
                            )}
                            {user.email === "topfinds.dj2@gmail.com" && (
                              <span className="text-xs text-brand font-bold">Mestre</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === "add" && (
            <motion.div
              key="add"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-w-6xl mx-auto"
            >
              <div className="bg-white rounded-3xl border border-neutral-200 p-6 md:p-8 space-y-8 shadow-sm">

                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-100 pb-6">
                  <div>
                    <h2 className="text-xl font-black">{editingProduct ? "Editar Produto" : "Novo Produto"}</h2>
                    <p className="text-sm text-neutral-500 mt-1">
                      {importMode === 'batch' ? "Valide e importe produtos de forma automatizada por planilha." : "Preencha os detalhes para exibição na loja."}
                    </p>
                  </div>
                  {!editingProduct && (
                    <div className="flex items-center bg-neutral-100 p-1.5 rounded-xl self-start md:self-auto">
                      <button
                        onClick={() => setImportMode('single')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${importMode === 'single' ? 'bg-white shadow-sm text-brand' : 'text-neutral-500 hover:text-neutral-700'}`}
                      >
                        <Plus className="w-4 h-4" /> Unitário
                      </button>
                      <button
                        onClick={() => setImportMode('batch')}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${importMode === 'batch' ? 'bg-white shadow-sm text-brand' : 'text-neutral-500 hover:text-neutral-700'}`}
                      >
                        <FileSpreadsheet className="w-4 h-4" /> Lote (Planilha)
                      </button>
                    </div>
                  )}
                </div>

                {importMode === 'single' ? (
                  <form onSubmit={handleSubmit(onSubmit)} className="space-y-8">

                    {/* Auto Import Section */}
                    <div className="flex flex-col items-center justify-center p-6 bg-brand/5 border border-brand/20 rounded-2xl mb-8">
                      <div className="w-12 h-12 bg-brand/10 rounded-full flex items-center justify-center mb-4">
                        <Zap className="w-6 h-6 text-brand" />
                      </div>
                      <h3 className="text-lg font-black text-brand mb-2">Importação Automática de Produto</h3>
                      <p className="text-sm text-neutral-600 mb-6 text-center max-w-lg">
                        Preencha o link original da loja para o sistema extrair os dados e fotos. Em seguida, cole o seu link de afiliado oficial para ser salvo.
                      </p>

                      <div className="flex flex-col md:flex-row items-center gap-4 w-full max-w-3xl mb-6">
                        <div className="w-full">
                          <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest ml-1 mb-1.5 block">1. Link Original da Loja (Para Busca)</label>
                          <input
                            type="url"
                            placeholder="https://www.mercadolivre.com.br/..."
                            value={importNormalUrl}
                            onChange={e => setImportNormalUrl(e.target.value)}
                            className={`w-full bg-white border ${isDuplicateUrl && !importAffiliateUrl ? 'border-red-500 focus:ring-red-500/20' : 'border-neutral-200 focus:ring-brand/5'} rounded-xl py-3 px-4 focus:ring-2 transition-all text-sm outline-none`}
                          />
                        </div>
                        <div className="w-full">
                          <label className="text-xs font-bold text-neutral-500 uppercase tracking-widest ml-1 mb-1.5 block">2. Seu Link de Afiliado (Ex: amzn.to)</label>
                          <input
                            type="url"
                            placeholder="https://amzn.to/..."
                            value={importAffiliateUrl}
                            onChange={e => setImportAffiliateUrl(e.target.value)}
                            className={`w-full bg-white border ${isDuplicateUrl && importAffiliateUrl ? 'border-red-500 focus:ring-red-500/20' : 'border-neutral-200 focus:ring-brand/5'} rounded-xl py-3 px-4 focus:ring-2 transition-all text-sm outline-none`}
                          />
                        </div>
                      </div>

                      {isDuplicateUrl && (
                        <div className="w-full max-w-3xl mb-6 flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-red-600 text-sm font-medium">
                          <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                          Atenção: Este produto (ou link) já parece estar cadastrado no sistema!
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() => handleScrape()}
                        disabled={isScraping || !importNormalUrl || isDuplicateUrl}
                        className="flex items-center gap-2 bg-brand text-white px-8 py-3.5 rounded-xl font-bold text-sm hover:bg-brand/90 transition-all disabled:opacity-50 shadow-lg shadow-brand/20 active:scale-95"
                      >
                        {isScraping ? (
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <Zap className="w-5 h-5" />
                        )}
                        {isScraping ? "Processando..." : "Importar Dados Agora"}
                      </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-1.5 col-span-1 md:col-span-1">
                        <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest ml-1">Nome do Produto</label>
                        <input
                          {...register("name", { required: true })}
                          placeholder="Ex: iPhone 15 Pro Max"
                          className="w-full bg-neutral-50 border border-neutral-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-brand/5 focus:border-brand transition-all text-sm outline-none"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest ml-1">Preço Original (DE)</label>
                        <input
                          type="number"
                          step="0.01"
                          {...register("price_original")}
                          placeholder="0.00"
                          className="w-full bg-neutral-50 border border-neutral-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-brand/5 focus:border-brand transition-all text-sm outline-none"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest ml-1">Preço Atual (POR)</label>
                        <input
                          type="number"
                          step="0.01"
                          {...register("price", { required: true })}
                          placeholder="0.00"
                          className="w-full bg-neutral-50 border border-neutral-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-brand/5 focus:border-brand transition-all text-sm outline-none"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest ml-1">Palavras-chave (Busca Inteligente)</label>
                      <input
                        {...register("keywords")}
                        placeholder="Ex: ps5, videogame, console, sony (separadas por vírgula)"
                        className="w-full bg-neutral-50 border border-neutral-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-brand/5 focus:border-brand transition-all text-sm outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest ml-1">Descrição Curta</label>
                      <textarea
                        {...register("description", { required: true })}
                        rows={3}
                        placeholder="Descreva as principais características do produto..."
                        className="w-full bg-neutral-50 border border-neutral-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-brand/5 focus:border-brand transition-all text-sm outline-none resize-none"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest ml-1">URL da Imagem</label>
                        <div className="relative">
                          <ImageIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                          <input
                            {...register("image", { required: true })}
                            placeholder="https://exemplo.com/imagem.jpg"
                            className="w-full bg-neutral-50 border border-neutral-200 rounded-xl py-3 pl-11 pr-4 focus:ring-2 focus:ring-brand/5 focus:border-brand transition-all text-sm outline-none"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5 col-span-1 md:col-span-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest ml-1">Links de Afiliado</label>
                          <button
                            type="button"
                            onClick={() => setAffiliateLinks([...affiliateLinks, { store: "", url: "" }])}
                            className="text-xs font-bold text-brand hover:underline"
                          >
                            + Adicionar Link
                          </button>
                        </div>
                        <div className="space-y-3">
                          {affiliateLinks.map((link, index) => (
                            <div key={index} className="flex items-center gap-2">
                              <input
                                type="text"
                                placeholder="Nome da loja (ex: Amazon)"
                                value={link.store}
                                onChange={(e) => {
                                  const newLinks = [...affiliateLinks];
                                  newLinks[index].store = e.target.value;
                                  setAffiliateLinks(newLinks);
                                }}
                                className="w-1/3 bg-neutral-50 border border-neutral-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-brand/5 focus:border-brand transition-all text-sm outline-none"
                              />
                              <input
                                type="url"
                                placeholder="https://..."
                                value={link.url}
                                onChange={(e) => {
                                  const newLinks = [...affiliateLinks];
                                  newLinks[index].url = e.target.value;
                                  setAffiliateLinks(newLinks);
                                }}
                                className="flex-1 bg-neutral-50 border border-neutral-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-brand/5 focus:border-brand transition-all text-sm outline-none"
                                required={index === 0}
                              />
                              {affiliateLinks.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const newLinks = [...affiliateLinks];
                                    newLinks.splice(index, 1);
                                    setAffiliateLinks(newLinks);
                                  }}
                                  className="p-3 text-neutral-400 hover:text-red-500 transition-colors"
                                >
                                  <Trash2 className="w-5 h-5" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest ml-1">Categoria</label>
                        <select
                          {...register("category_id", { required: true })}
                          className="w-full bg-neutral-50 border border-neutral-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-brand/5 focus:border-brand transition-all text-sm outline-none appearance-none"
                        >
                          <option value="">Selecione uma categoria</option>
                          {categories.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest ml-1">Subcategoria</label>
                        <select
                          {...register("subcategory_id", { required: true })}
                          disabled={!selectedCategoryId}
                          className="w-full bg-neutral-50 border border-neutral-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-brand/5 focus:border-brand transition-all text-sm outline-none appearance-none disabled:opacity-50"
                        >
                          <option value="">Selecione uma subcategoria</option>
                          {selectedCategory?.subcategories.map(sub => (
                            <option key={sub.id} value={sub.id}>{sub.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest ml-1">Tag Personalizada (Opcional)</label>
                        <input
                          {...register("tag_label")}
                          placeholder="Ex: Oferta Relâmpago"
                          className="w-full bg-neutral-50 border border-neutral-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-brand/5 focus:border-brand transition-all text-sm outline-none"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest ml-1">Cor da Tag</label>
                        <div className="flex items-center gap-3">
                          {['#f43f5e', '#ec4899', '#d946ef', '#a855f7', '#8b5cf6', '#6366f1', '#3b82f6', '#0ea5e9', '#06b6d4', '#10b981', '#22c55e', '#f59e0b', '#f97316', '#ef4444', '#171717'].map((col) => (
                            <button
                              key={col}
                              type="button"
                              onClick={() => setValue("tag_color", col)}
                              className="w-8 h-8 rounded-full border border-neutral-200 transition-all hover:scale-110 active:scale-95"
                              style={{ backgroundColor: col, boxShadow: watch("tag_color") === col ? `0 0 0 2px white, 0 0 0 4px ${col}` : 'none' }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 p-4 bg-neutral-50 rounded-2xl border border-neutral-100">
                      <input
                        type="checkbox"
                        id="featured"
                        {...register("featured")}
                        className="w-5 h-5 rounded-md border-neutral-300 text-brand focus:ring-brand"
                      />
                      <label htmlFor="featured" className="text-sm font-bold text-neutral-700 flex items-center gap-2 cursor-pointer">
                        <Tag className="w-4 h-4 text-amber-500" />
                        Destacar este produto na página inicial
                      </label>
                    </div>

                    <div className="flex items-center gap-4 pt-4">
                      <button
                        type="submit"
                        className="flex-1 bg-brand text-white font-bold py-4 rounded-xl hover:bg-brand/90 transition-all active:scale-[0.98] shadow-xl shadow-brand/10"
                      >
                        {editingProduct ? "Salvar Alterações" : "Cadastrar Produto"}
                      </button>
                      {editingProduct && (
                        <button
                          type="button"
                          onClick={() => { setEditingProduct(null); reset(); setActiveTab("products"); }}
                          className="px-8 bg-neutral-100 text-neutral-600 font-bold py-4 rounded-xl hover:bg-neutral-200 transition-all"
                        >
                          Cancelar
                        </button>
                      )}
                    </div>
                  </form>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    {/* Lado Esquerdo: Upload & Fila */}
                    <div className="space-y-6">
                      <div className="flex flex-col items-center justify-center p-8 bg-brand/5 border-2 border-dashed border-brand/20 rounded-3xl text-center">
                        <FileSpreadsheet className="w-12 h-12 text-brand mb-4" />
                        <h3 className="text-lg font-black text-brand mb-2">Subir Produtos em Lote</h3>
                        <p className="text-sm text-neutral-600 mb-6 max-w-sm mx-auto">
                          Envie uma planilha XLSX com as colunas <strong className="font-bold">link_afiliado</strong> e <strong className="font-bold">link_pagina</strong>.
                        </p>
                        <label className="bg-brand text-white px-8 py-3.5 flex items-center gap-2 rounded-xl font-bold text-sm cursor-pointer hover:bg-brand/90 transition-all shadow-lg active:scale-95 shadow-brand/20">
                          <UploadCloud className="w-5 h-5" />
                          Selecionar Planilha
                          <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} />
                        </label>
                        <button type="button" onClick={downloadTemplate} className="mt-4 text-xs font-bold text-neutral-500 hover:text-brand transition-colors">
                          ⬇ Baixar arquivo modelo (.xlsx)
                        </button>
                      </div>

                      <div className="bg-neutral-50 p-6 rounded-3xl border border-neutral-200">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="font-bold text-neutral-800">Fila de Leitura</h4>
                          <span className="text-xs font-black bg-neutral-200 text-neutral-600 px-3 py-1 rounded-full">{batchQueue.length}</span>
                        </div>

                        <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 no-scrollbar">
                          {batchQueue.length === 0 ? (
                            <div className="text-center py-8 text-neutral-400 text-sm font-medium border-2 border-dashed border-neutral-200 rounded-2xl">
                              Nenhum arquivo processado.
                            </div>
                          ) : (
                            batchQueue.map((item, idx) => (
                              <div key={item.id} className="flex items-center justify-between p-3.5 bg-white border border-neutral-200 rounded-xl">
                                <div className="flex items-center gap-3 overflow-hidden">
                                  <span className="font-black text-xs text-neutral-400 w-5">{idx + 1}</span>
                                  <span className="text-xs truncate text-neutral-500 max-w-[150px]" title={item.originalUrl}>{item.originalUrl}</span>
                                </div>
                                <div className="shrink-0 flex items-center">
                                  {item.status === 'pending' && <span className="bg-neutral-100 text-neutral-500 text-[10px] font-bold px-2 py-1 rounded lowercase">Aguardando</span>}
                                  {item.status === 'processing' && <span className="bg-brand/10 text-brand text-[10px] font-bold px-2 py-1 flex items-center gap-1 rounded uppercase tracking-wider"><Loader2 className="w-3 h-3 animate-spin" /> Extraindo</span>}
                                  {item.status === 'success' && <CheckCircle className="w-5 h-5 text-emerald-500" />}
                                  {item.status === 'error' && <XCircle className="w-5 h-5 text-red-500" title={item.errorDetails} />}
                                </div>
                              </div>
                            ))
                          )}
                        </div>

                        {batchQueue.length > 0 && batchQueue.some(i => i.status === 'pending') && (
                          <button
                            type="button"
                            onClick={() => setIsBatchProcessing(!isBatchProcessing)}
                            className={`w-full mt-4 flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm transition-all shadow-lg active:scale-95 ${isBatchProcessing ? "bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/20" : "bg-brand hover:bg-brand/90 text-white shadow-brand/20"}`}
                          >
                            {isBatchProcessing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Zap className="w-4 h-4" />}
                            {isBatchProcessing ? "Pausar Leitura" : "Iniciar Importação Mágica"}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Error Log */}
                    {importErrorLog.length > 0 && (
                      <div className="bg-red-50 border border-red-100 p-5 rounded-2xl">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-bold text-red-700 text-sm flex items-center gap-2">
                            <XCircle className="w-4 h-4" /> Log de Erros ({importErrorLog.length})
                          </h4>
                          <button
                            onClick={() => setImportErrorLog([])}
                            className="text-[10px] font-bold text-red-400 hover:text-red-600 transition-colors"
                          >
                            Limpar
                          </button>
                        </div>
                        <div className="space-y-2 max-h-[180px] overflow-y-auto no-scrollbar">
                          {importErrorLog.map((err, i) => (
                            <div key={i} className="bg-white border border-red-100 rounded-xl p-3">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="text-[10px] font-black text-red-500 uppercase tracking-wider">{err.time}</span>
                                <span className="text-[10px] bg-red-100 text-red-600 font-bold px-2 py-0.5 rounded">{err.reason}</span>
                              </div>
                              <p className="text-xs text-neutral-500 truncate" title={err.url}>{err.url}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}


                    {/* Lado Direito: Validação Visualização Pronta */}
                <div className="bg-neutral-50 rounded-3xl p-6 border border-neutral-200 flex flex-col h-full">
                  <div className="flex items-start justify-between mb-6">
                    <div>
                      <h3 className="font-black text-neutral-800 text-lg">Fila de Aprovação ({batchQueue.filter(i => i.status === 'success').length})</h3>
                      <p className="text-xs text-neutral-500 mt-1 max-w-[200px]">Valide e mande para a loja se tudo estiver correto.</p>
                    </div>
                    {selectedBatchItemIds.size > 0 && (
                      <button
                        onClick={removeBatchItems}
                        className="bg-red-100 hover:bg-red-200 text-red-600 px-3 py-1.5 rounded-lg flex items-center gap-1.5 text-xs font-bold transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Excluir ({selectedBatchItemIds.size})
                      </button>
                    )}
                  </div>

                  <div className="flex-1 overflow-y-auto no-scrollbar space-y-4 min-h-[300px] mb-4">
                    {batchQueue.filter(i => i.status === 'success').length === 0 ? (
                      <div className="h-full min-h-[250px] flex flex-col items-center justify-center text-center">
                        <div className="w-16 h-16 bg-white border border-neutral-200 rounded-full flex items-center justify-center mb-4 opacity-50">
                          <CheckCircle className="w-8 h-8 text-neutral-300" />
                        </div>
                        <p className="text-sm font-medium text-neutral-400">Os produtos que derem<br />sucesso aparecerão aqui.</p>
                      </div>
                    ) : (
                      batchQueue.filter(i => i.status === 'success').map((item) => (
                        <div key={item.id} className="relative bg-white border border-neutral-200 p-4 rounded-2xl flex items-start gap-3 group shadow-sm">
                          <input
                            type="checkbox"
                            checked={selectedBatchItemIds.has(item.id)}
                            onChange={(e) => {
                              const newSet = new Set(selectedBatchItemIds);
                              if (e.target.checked) newSet.add(item.id); else newSet.delete(item.id);
                              setSelectedBatchItemIds(newSet);
                            }}
                            className="mt-1.5 rounded text-brand focus:ring-brand flex-shrink-0"
                          />
                          <button
                            onClick={(e) => { e.stopPropagation(); setEditingBatchItem(item); }}
                            className="absolute top-2 right-2 p-1.5 text-neutral-400 hover:text-brand hover:bg-neutral-100 rounded-lg transition-all"
                            title="Editar item"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <div className="w-14 h-14 shrink-0 bg-neutral-50 border border-neutral-100 rounded-xl overflow-hidden flex items-center justify-center">
                            <img src={item.scrapedData?.image} className="w-full h-full object-contain p-1" />
                          </div>
                          <div className="flex-1 min-w-0 pr-8">
                            <h5 className="font-bold text-sm text-neutral-900 line-clamp-2 leading-tight mb-1" title={item.scrapedData?.name}>{item.scrapedData?.name}</h5>
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-black text-brand">R$ {item.scrapedData?.price}</p>
                              <span className="text-[10px] bg-neutral-100 text-neutral-500 px-1.5 py-0.5 rounded font-bold">{categories.find(c => c.id == item.scrapedData?.category_id)?.name || 'Sem cat'}</span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <button
                    onClick={publishBatchItems}
                    disabled={batchQueue.filter(i => i.status === 'success').length === 0}
                    className="w-full mt-auto bg-emerald-500 text-white font-black py-4 rounded-xl flex items-center justify-center gap-2 hover:bg-emerald-600 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20"
                  >
                    <Save className="w-5 h-5" /> Publicar Todos Concluídos
                  </button>
                </div>
              </div>
              )}
            </div>
            </motion.div>
          )}
      </AnimatePresence>
    </main>

      {/* Batch Item Edit Modal */ }
  <AnimatePresence>
    {editingBatchItem && (
      <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-3xl shadow-xl w-full max-w-2xl overflow-hidden max-h-[90vh] flex flex-col"
        >
          <div className="p-6 border-b border-neutral-100 flex items-center justify-between shadow-sm z-10">
            <div>
              <h3 className="text-xl font-black text-neutral-900">Editar Produto da Fila</h3>
              <p className="text-sm text-neutral-500">Faça ajustes antes de enviá-lo para a tela principal.</p>
            </div>
            <button onClick={() => setEditingBatchItem(null)} className="p-2 text-neutral-400 hover:bg-neutral-100 rounded-full transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-6 overflow-y-auto space-y-5">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest ml-1">Nome do Produto</label>
              <input
                type="text"
                value={editingBatchItem.scrapedData?.name || ""}
                onChange={e => setEditingBatchItem({ ...editingBatchItem, scrapedData: { ...editingBatchItem.scrapedData, name: e.target.value } })}
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-brand/5 focus:border-brand transition-all text-sm outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest ml-1">Preço Atual (POR)</label>
                <input
                  type="number"
                  step="0.01"
                  value={editingBatchItem.scrapedData?.price || ""}
                  onChange={e => setEditingBatchItem({ ...editingBatchItem, scrapedData: { ...editingBatchItem.scrapedData, price: parseFloat(e.target.value) || 0 } })}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-brand/5 focus:border-brand transition-all text-sm outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest ml-1">Preço Original (DE)</label>
                <input
                  type="number"
                  step="0.01"
                  value={editingBatchItem.scrapedData?.price_original || ""}
                  onChange={e => setEditingBatchItem({ ...editingBatchItem, scrapedData: { ...editingBatchItem.scrapedData, price_original: parseFloat(e.target.value) || 0 } })}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-brand/5 focus:border-brand transition-all text-sm outline-none"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest ml-1">URL da Imagem</label>
              <input
                type="text"
                value={editingBatchItem.scrapedData?.image || ""}
                onChange={e => setEditingBatchItem({ ...editingBatchItem, scrapedData: { ...editingBatchItem.scrapedData, image: e.target.value } })}
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-brand/5 focus:border-brand transition-all text-sm outline-none"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest ml-1">Categoria</label>
                <select
                  value={editingBatchItem.scrapedData?.category_id || ""}
                  onChange={e => setEditingBatchItem({ ...editingBatchItem, scrapedData: { ...editingBatchItem.scrapedData, category_id: parseInt(e.target.value), subcategory_id: "" } })}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-brand/5 focus:border-brand transition-all text-sm outline-none appearance-none"
                >
                  <option value="">Selecione...</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-400 uppercase tracking-widest ml-1">Subcategoria</label>
                <select
                  value={editingBatchItem.scrapedData?.subcategory_id || ""}
                  onChange={e => setEditingBatchItem({ ...editingBatchItem, scrapedData: { ...editingBatchItem.scrapedData, subcategory_id: parseInt(e.target.value) } })}
                  className="w-full bg-neutral-50 border border-neutral-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-brand/5 focus:border-brand transition-all text-sm outline-none appearance-none"
                >
                  <option value="">Selecione...</option>
                  {categories.find(c => c.id == editingBatchItem.scrapedData?.category_id)?.subcategories.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
          <div className="p-6 border-t border-neutral-100 flex items-center justify-end gap-3 z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] bg-white">
            <button
              onClick={() => setEditingBatchItem(null)}
              className="px-6 py-3 rounded-xl font-bold text-neutral-600 bg-neutral-100 hover:bg-neutral-200 transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={() => {
                setBatchQueue(prev => prev.map(item => item.id === editingBatchItem.id ? editingBatchItem : item));
                setEditingBatchItem(null);
              }}
              className="px-6 py-3 rounded-xl font-bold text-white bg-brand hover:bg-brand/90 shadow-lg shadow-brand/20 transition-all"
            >
              Salvar Alterações
            </button>
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>

  {/* Success Animation Overlay */ }
  <AnimatePresence>
    {successModal.isOpen && (
      <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.5, y: 50 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.5, y: -50 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="bg-white rounded-[2rem] shadow-2xl p-10 flex flex-col items-center text-center max-w-sm relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-brand via-blue-400 to-indigo-600" />
          <div className="w-24 h-24 bg-gradient-to-tr from-brand to-indigo-600 rounded-full flex items-center justify-center mb-6 shadow-xl shadow-brand/30">
            <PartyPopper className="w-12 h-12 text-white drop-shadow-md" />
          </div>
          <h2 className="text-3xl font-black text-neutral-900 mb-3 tracking-tight">Eeeeba!</h2>
          <p className="text-lg text-neutral-600 font-medium mb-8 leading-relaxed">
            {successModal.message}
          </p>

          <button
            onClick={() => { setSuccessModal({ isOpen: false, message: "" }); setActiveTab("products"); }}
            className="w-full bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold py-3.5 px-6 rounded-xl transition-all active:scale-95"
          >
            Continuar trabalhando
          </button>
        </motion.div>
      </div>
    )}
  </AnimatePresence>

  {/* Custom Modal */ }
  <AnimatePresence>
    {modalConfig.isOpen && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden"
        >
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              {modalConfig.type === 'alert' && <AlertTriangle className="w-6 h-6 text-amber-500" />}
              <h3 className="text-xl font-black text-neutral-900">{modalConfig.title}</h3>
            </div>

            {modalConfig.message && (
              <p className="text-neutral-600 text-sm mb-6">{modalConfig.message}</p>
            )}

            {modalConfig.type === 'prompt' && (
              <input
                type="text"
                autoFocus
                value={modalConfig.inputValue}
                onChange={(e) => setModalConfig({ ...modalConfig, inputValue: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && modalConfig.inputValue?.trim()) {
                    modalConfig.onConfirm?.(modalConfig.inputValue.trim());
                    closeModal();
                  }
                }}
                className="w-full bg-neutral-50 border border-neutral-200 rounded-xl py-3 px-4 focus:ring-2 focus:ring-brand/5 focus:border-brand transition-all text-sm outline-none mb-6"
                placeholder="Digite aqui..."
              />
            )}

            <div className="flex items-center justify-end gap-3">
              {modalConfig.type !== 'alert' && (
                <button
                  onClick={closeModal}
                  className="px-4 py-2 rounded-xl text-sm font-bold text-neutral-500 hover:bg-neutral-100 transition-colors"
                >
                  Cancelar
                </button>
              )}
              <button
                onClick={() => {
                  if (modalConfig.type === 'prompt') {
                    if (modalConfig.inputValue?.trim()) {
                      modalConfig.onConfirm?.(modalConfig.inputValue.trim());
                      closeModal();
                    }
                  } else {
                    modalConfig.onConfirm?.();
                    closeModal();
                  }
                }}
                className="px-6 py-2 bg-brand text-white rounded-xl text-sm font-bold hover:bg-brand/90 transition-colors shadow-lg shadow-brand/20"
              >
                {modalConfig.type === 'alert' ? 'OK' : 'Confirmar'}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
    </div >
  );
}
