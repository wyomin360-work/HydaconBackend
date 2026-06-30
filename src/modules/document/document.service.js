const Document = require("../../schemas/document.schema");
const { sendFailResponse } = require("../../utils/responseHandlers");
const { checkS3FileExists, deleteS3File } = require("../../utils/s3");
const { attachId, normalizeString } = require("../../utils/heplers");
const mongoose = require("mongoose");

async function addDocument(userId, data) {
  const documentsList = data.documents;

  if (!Array.isArray(documentsList) || documentsList.length === 0) {
    sendFailResponse("send valid array of documents");
  }

  const docIdSet = new Set();
  const duplicateDocIds = [];
  const normalizedDocIds = [];

  documentsList.forEach((document) => {
    const normalizedDocId = normalizeString(document.docId);
    if (docIdSet.has(normalizedDocId)) {
      duplicateDocIds.push(normalizedDocId);
    } else {
      docIdSet.add(normalizedDocId);
      normalizedDocIds.push(normalizedDocId);
    }
  });

  if (duplicateDocIds.length > 0) {
    sendFailResponse(
      `Duplicate document IDs found in the input data: ${duplicateDocIds.join(", ")}`,
    );
  }

  // Pre-fetch all existing documents to improve performance
  const existingDocsFromDb = await Document.find({
    ownerId: userId,
    docId: { $in: normalizedDocIds },
  });

  const existingDocsMap = new Map();
  existingDocsFromDb.forEach((doc) => {
    existingDocsMap.set(doc.docId, doc);
  });

  const errors = [];
  const documentsToInsert = [];
  const existingDocuments = [];

  // Process all documents concurrently
  await Promise.all(
    documentsList.map(async (document) => {
      const { docName, docSize, docType, docUrl, number } = document;
      const docId = normalizeString(document.docId);

      try {
        const isFileExist = await checkS3FileExists(docUrl);
        if (!isFileExist) {
          console.error(`File not found for docUrl: ${docUrl}`);
          errors.push(`File not found on the server for document: ${docName}`);
          return;
        }

        const isDocument = existingDocsMap.get(docId);
        if (isDocument) {
          existingDocuments.push(isDocument);
          return;
        }

        documentsToInsert.push({
          docId,
          docName,
          docSize,
          docType,
          docUrl,
          ownerId: userId,
          number,
        });
      } catch (error) {
        errors.push(`Error processing document: ${docName} - ${error.message}`);
      }
    }),
  );

  let finalDocuments = [
    ...existingDocuments.map((doc) => attachId(doc.toObject())),
  ];

  if (documentsToInsert.length > 0) {
    const newDocuments = await Document.insertMany(documentsToInsert);
    finalDocuments = [
      ...finalDocuments,
      ...newDocuments.map((doc) => attachId(doc.toObject())),
    ];
  }

  if (finalDocuments.length > 0) {
    return {
      message: "Documents processed successfully",
      data: {
        documentAdded: true,
        documents: finalDocuments,
      },
    };
  }

  sendFailResponse(
    `No documents were added due to the following reasons: ${errors.join("; ")}`,
  );
}

async function documentsList(userId, filters, userRole) {
  const { docName, docType, ownerId, page = 1, limit = 10 } = filters;

  const query = {
    ownerId: userId,
  };

  if (docName) query.docName = { $regex: docName, $options: "i" };
  if (docType) query.docType = docType;

  // Only Admin can filter by ownerId, assuming role is passed or handled via controller
  if (ownerId && userRole === "admin") query.ownerId = ownerId;

  const pageNumber = parseInt(page, 10);
  const pageSize = parseInt(limit, 10);
  const skip = (pageNumber - 1) * pageSize;

  const totalDocuments = await Document.countDocuments(query);
  const documents = await Document.find(query)
    .skip(skip)
    .limit(pageSize)
    .sort({ createdAt: -1 });

  return {
    message: "Documents retrieved successfully",
    data: {
      documents: documents.map((doc) => attachId(doc.toObject())),
      totalDocuments,
      totalPages: Math.ceil(totalDocuments / pageSize),
      currentPage: pageNumber,
    },
  };
}

async function editDocument(docId, data) {
  const { docName, docSize, comment, lock, status, number } = data;

  const isDocument = await Document.findById(docId);

  if (!isDocument) {
    sendFailResponse("Document Not Found");
  }

  if (isDocument.lock) {
    sendFailResponse(
      "This document is locked and cannot be updated, as it is actively referenced in other areas",
    );
  }

  const updateData = {};

  if (docName !== undefined) updateData.docName = docName;
  if (docSize !== undefined) updateData.docSize = docSize;
  if (comment !== undefined) updateData.comment = comment;
  if (number !== undefined) updateData.number = number;
  if (lock !== undefined) updateData.lock = lock;
  if (status !== undefined) updateData.status = status;

  await Document.findByIdAndUpdate(docId, { $set: updateData });

  return {
    message: "Document updated successfully",
    data: { documentUpdated: true },
  };
}

async function documentDetails(docId) {
  const isDocument = await Document.findById(docId);

  if (!isDocument) {
    sendFailResponse("Document Not Found");
  }

  return {
    message: "Document retrieved successfully",
    data: attachId(isDocument.toObject()),
  };
}

async function deleteDocuments(docId) {
  const documentDetails = await Document.findById(docId);

  if (!documentDetails) {
    sendFailResponse("Document Not Found");
  }

  if (documentDetails.lock) {
    sendFailResponse(
      "This document is locked and cannot be deleted, as it is actively referenced in other areas",
    );
  }

  await deleteS3File(documentDetails.docUrl);
  await Document.findByIdAndDelete(docId);

  return {
    message: "Document deleted successfully",
    data: { documentDeleted: true },
  };
}

module.exports = {
  addDocument,
  documentsList,
  editDocument,
  documentDetails,
  deleteDocuments,
};
