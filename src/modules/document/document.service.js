const Document = require("../../schemas/document.schema");
const { sendFailResponse } = require("../../utils/responseHandlers");
const { checkS3FileExists, deleteS3File } = require("../../utils/s3");
const { attachId } = require("../../utils/heplers");
const mongoose = require("mongoose");

async function addDocument(userId, data) {
  const documentsList = data.documents;

  if (!Array.isArray(documentsList) || documentsList.length === 0) {
    sendFailResponse("send valid array of documents");
  }

  const docIdSet = new Set();
  const duplicateDocIds = [];

  documentsList.forEach((document) => {
    if (docIdSet.has(document.docId)) {
      duplicateDocIds.push(document.docId);
    } else {
      docIdSet.add(document.docId);
    }
  });

  if (duplicateDocIds.length > 0) {
    sendFailResponse(
      `Duplicate document IDs found in the input data: ${duplicateDocIds.join(", ")}`,
    );
  }

  const errors = [];
  const documentsToInsert = [];

  for (const document of documentsList) {
    const { docId, docName, docSize, docType, docUrl, number } = document;

    try {
      const isFileExist = await checkS3FileExists(docUrl);
      if (!isFileExist) {
        errors.push(`File not found on the server for document: ${docName}`);
        continue;
      }

      const isDocument = await Document.findOne({
        ownerId: userId,
        docId,
      });
      if (isDocument) {
        errors.push(`Document with ID: ${docId} already exists.`);
        continue;
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
  }

  if (documentsToInsert.length > 0) {
    const newDocuments = await Document.insertMany(documentsToInsert);
    return {
      message: "Documents added successfully",
      data: {
        documentAdded: true,
        documents: newDocuments.map((doc) => attachId(doc.toObject())),
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
