// src/components/AdminCategoryManagerScreen.jsx

import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, addDoc, deleteDoc, updateDoc, doc, query, orderBy } from 'firebase/firestore';

// This is a dedicated component for managing Discover screen categories.
function AdminCategoryManagerScreen({ showMessage }) {
    // --- STATE MANAGEMENT ---
    const [categories, setCategories] = useState([]);
    const [loadingCategories, setLoadingCategories] = useState(true);
    const [newCategoryName, setNewCategoryName] = useState('');
    const [newCategoryOrder, setNewCategoryOrder] = useState(100);
    const [isAdding, setIsAdding] = useState(false);

    // --- EFFECT: Fetches all categories from the 'content_categories' collection ---
    useEffect(() => {
        const categoriesCollectionRef = collection(db, "content_categories");
        const q = query(categoriesCollectionRef, orderBy("orderIndex"));
        const unsubCategories = onSnapshot(q, (snapshot) => {
            const cats = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(cat => cat.name !== 'Live Premieres'); // Exclude the special premieres category
            setCategories(cats);
            setLoadingCategories(false);
        });

        return () => unsubCategories();
    }, []);

    // --- HANDLERS FOR CATEGORY ACTIONS ---
    const handleAddCategory = async (e) => {
        e.preventDefault();
        if (!newCategoryName) { return; }
        setIsAdding(true);
        try {
            await addDoc(collection(db, "content_categories"), {
                name: newCategoryName,
                orderIndex: Number(newCategoryOrder),
                isActive: true
            });
            showMessage(`Category "${newCategoryName}" added successfully.`);
            setNewCategoryName('');
            setNewCategoryOrder(100);
        } catch (error) { 
            showMessage(`Error adding category: ${error.message}`); 
        } finally { 
            setIsAdding(false); 
        }
    };

    const handleDeleteCategory = async (cat) => {
        if (window.confirm(`Are you sure you want to permanently delete the category "${cat.name}"?`)) {
            try {
                await deleteDoc(doc(db, "content_categories", cat.id));
                showMessage("Category deleted.");
            } catch (error) { 
                showMessage(`Error deleting category: ${error.message}`); 
            }
        }
    };

    const handleToggleActive = async (cat) => {
        try {
            await updateDoc(doc(db, "content_categories", cat.id), { isActive: !cat.isActive });
            showMessage("Category status updated successfully.");
        } catch (error) { 
            showMessage(`Error updating category: ${error.message}`); 
        }
    };

    return (
        <>
            <p className="heading">Discover Screen Manager</p>
            <p className="subHeading">Create, manage, and organize the content categories that appear on the main Discover screen.</p>
            
            <div className="dashboardSection">
                <p className="dashboardSectionTitle">Add New Discover Category</p>
                <form onSubmit={handleAddCategory} className="flex items-end gap-4">
                    <div className="formGroup flex-grow mb-0">
                        <label className="formLabel">Category Name:</label>
                        <input type="text" className="formInput" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} required />
                    </div>
                    <div className="formGroup mb-0">
                        <label className="formLabel">Order:</label>
                        <input type="number" className="formInput" value={newCategoryOrder} onChange={(e) => setNewCategoryOrder(e.target.value)} style={{width: '80px'}} />
                    </div>
                    <button type="submit" className="button m-0" disabled={isAdding}>
                        {isAdding ? 'Adding...' : 'Add Category'}
                    </button>
                </form>
            </div>
            
            <div className="dashboardSection">
                <p className="dashboardSectionTitle">Existing Categories</p>
                {loadingCategories ? <p>Loading...</p> : (
                    <div className="dashboardContentList" style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '10px' }}>
                        {categories.map(cat => (
                            <div key={cat.id} className="adminDashboardItem" style={{alignItems: 'center', gap: '10px'}}>
                                <span className="flex-grow font-bold">{cat.name}</span>
                                <span className="text-sm text-gray-400">Order: {cat.orderIndex}</span>
                                <span className={`font-bold ${cat.isActive ? 'text-green-400' : 'text-red-400'}`}>{cat.isActive ? 'Active' : 'Inactive'}</span>
                                <button onClick={() => handleToggleActive(cat)} className="adminActionButton">{cat.isActive ? 'Deactivate' : 'Activate'}</button>
                                <button onClick={() => handleDeleteCategory(cat)} className="adminActionButton reject">Delete</button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}

export default AdminCategoryManagerScreen;