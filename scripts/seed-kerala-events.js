const mongoose = require("mongoose");
const Database = require("../src/config/mongodb.config");
const {
  Event,
  EVENT_TYPE,
  EVENT_STATUS,
} = require("../src/schemas/event.schema");

const sampleEvents = [
  {
    title: "Kerala Tech Innovation Conclave 2026",
    description:
      "A premier gathering of tech founders, software architects, and AI developers showcasing cutting-edge tech innovations in Kerala.",
    bannerImage: "https://images.unsplash.com/photo-1540575467063-178a50c2df87",
    venue: "Lulu Bolgatty International Convention Centre, Bolgatty Island",
    location: {
      type: "Point",
      coordinates: [76.2673, 9.9881], // [longitude, latitude]
    },
    city: "Kochi",
    state: "Kerala",
    country: "India",
    date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), // 5 days from now
    endDate: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
    registrationDeadline: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
    capacity: 500,
    type: EVENT_TYPE.CONFERENCE,
    status: EVENT_STATUS.UPCOMING,
    active: true,
  },
  {
    title: "Trivandrum Global AI & Robotics Expo",
    description:
      "An international expo featuring breakthroughs in Artificial Intelligence, IoT devices, and Robotics research from Kerala's leading IT hubs.",
    bannerImage: "https://images.unsplash.com/photo-1485827404703-89b55fcc595e",
    venue: "Technopark Campus, Kazhakoottam",
    location: {
      type: "Point",
      coordinates: [76.8807, 8.5581], // [longitude, latitude]
    },
    city: "Thiruvananthapuram",
    state: "Kerala",
    country: "India",
    date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
    endDate: new Date(Date.now() + 11 * 24 * 60 * 60 * 1000),
    registrationDeadline: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
    capacity: 350,
    type: EVENT_TYPE.WORKSHOP,
    status: EVENT_STATUS.UPCOMING,
    active: true,
  },
  {
    title: "Malabar Startup & Entrepreneurship Summit",
    description:
      "Empowering early-stage founders and student entrepreneurs with mentorship, VC pitching, and growth strategies in Malabar region.",
    bannerImage: "https://images.unsplash.com/photo-1515187029135-18ee286d815b",
    venue: "Calicut Trade Centre, Mini Bypass Road",
    location: {
      type: "Point",
      coordinates: [75.7925, 11.2612], // [longitude, latitude]
    },
    city: "Kozhikode",
    state: "Kerala",
    country: "India",
    date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
    endDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
    registrationDeadline: new Date(Date.now() + 12 * 24 * 60 * 60 * 1000),
    capacity: 250,
    type: EVENT_TYPE.MEETUP,
    status: EVENT_STATUS.UPCOMING,
    active: true,
  },
  {
    title: "Kerala Cultural Arts & Heritage Festival",
    description:
      "Celebrating Kerala's rich cultural traditions, classical music performances, mural art displays, and heritage crafts.",
    bannerImage: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819",
    venue: "Vadakkunnathan Temple Ground (Thekke Gopura Maithanam)",
    location: {
      type: "Point",
      coordinates: [76.2144, 10.5276], // [longitude, latitude]
    },
    city: "Thrissur",
    state: "Kerala",
    country: "India",
    date: new Date(Date.now() + 18 * 24 * 60 * 60 * 1000),
    endDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
    registrationDeadline: new Date(Date.now() + 16 * 24 * 60 * 60 * 1000),
    capacity: 1000,
    type: EVENT_TYPE.OTHER,
    status: EVENT_STATUS.UPCOMING,
    active: true,
  },
  {
    title: "Backwater Eco-Tourism & Hospitality Forum",
    description:
      "Dialogue on sustainable tourism practices, eco-friendly houseboats, and marine ecosystem conservation in Alappuzha.",
    bannerImage: "https://images.unsplash.com/photo-1602216056096-3b40cc0c9944",
    venue: "Punnamada Finishing Point Complex",
    location: {
      type: "Point",
      coordinates: [76.3475, 9.5012], // [longitude, latitude]
    },
    city: "Alappuzha",
    state: "Kerala",
    country: "India",
    date: new Date(Date.now() + 22 * 24 * 60 * 60 * 1000),
    endDate: new Date(Date.now() + 23 * 24 * 60 * 60 * 1000),
    registrationDeadline: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
    capacity: 200,
    type: EVENT_TYPE.CONFERENCE,
    status: EVENT_STATUS.UPCOMING,
    active: true,
  },
  {
    title: "Western Ghats Biodiversity & Climate Summit",
    description:
      "Environmental conference focusing on wildlife preservation, tea plantation sustainability, and Western Ghats ecology.",
    bannerImage: "https://images.unsplash.com/photo-1506744038136-46273834b3fb",
    venue: "High Range Club Convention Hall",
    location: {
      type: "Point",
      coordinates: [77.0597, 10.0889], // [longitude, latitude]
    },
    city: "Munnar",
    state: "Kerala",
    country: "India",
    date: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000),
    endDate: new Date(Date.now() + 26 * 24 * 60 * 60 * 1000),
    registrationDeadline: new Date(Date.now() + 23 * 24 * 60 * 60 * 1000),
    capacity: 150,
    type: EVENT_TYPE.WORKSHOP,
    status: EVENT_STATUS.UPCOMING,
    active: true,
  },
  {
    title: "Wayanad Agro-Tech & Organic Farming Meet",
    description:
      "Connecting spice growers, coffee planters, and agricultural scientists to showcase smart farming tools and sustainable yield techniques.",
    bannerImage: "https://images.unsplash.com/photo-1500937386664-56d1dfef3854",
    venue: "Wayanad Club Convention Centre, Kalpetta",
    location: {
      type: "Point",
      coordinates: [76.0827, 11.6103], // [longitude, latitude]
    },
    city: "Kalpetta",
    state: "Kerala",
    country: "India",
    date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    endDate: new Date(Date.now() + 31 * 24 * 60 * 60 * 1000),
    registrationDeadline: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000),
    capacity: 300,
    type: EVENT_TYPE.MEETUP,
    status: EVENT_STATUS.UPCOMING,
    active: true,
  },
  {
    title: "North Malabar Textile & Handloom Fair",
    description:
      "Showcasing traditional Malabar weavers, sustainable fabrics, handcrafted apparel, and export opportunities.",
    bannerImage: "https://images.unsplash.com/photo-1558769132-cb1aea458c5e",
    venue: "Police Maidan Ground",
    location: {
      type: "Point",
      coordinates: [75.3704, 11.8745], // [longitude, latitude]
    },
    city: "Kannur",
    state: "Kerala",
    country: "India",
    date: new Date(Date.now() + 35 * 24 * 60 * 60 * 1000),
    endDate: new Date(Date.now() + 37 * 24 * 60 * 60 * 1000),
    registrationDeadline: new Date(Date.now() + 33 * 24 * 60 * 60 * 1000),
    capacity: 400,
    type: EVENT_TYPE.OTHER,
    status: EVENT_STATUS.UPCOMING,
    active: true,
  },
  {
    title: "Kollam Maritime & Coastal Trade Conference",
    description:
      "A gathering of port authorities, shipping companies, and seafood exporters discussing port modernization and trade logistics.",
    bannerImage: "https://images.unsplash.com/photo-1518837695005-2083093ee35b",
    venue: "Asramam Maidan Convention Center",
    location: {
      type: "Point",
      coordinates: [76.5947, 8.8932], // [longitude, latitude]
    },
    city: "Kollam",
    state: "Kerala",
    country: "India",
    date: new Date(Date.now() + 40 * 24 * 60 * 60 * 1000),
    endDate: new Date(Date.now() + 41 * 24 * 60 * 60 * 1000),
    registrationDeadline: new Date(Date.now() + 38 * 24 * 60 * 60 * 1000),
    capacity: 250,
    type: EVENT_TYPE.CONFERENCE,
    status: EVENT_STATUS.UPCOMING,
    active: true,
  },
  {
    title: "Palakkad Renewable Energy & Solar Tech Expo",
    description:
      "Clean energy conference bringing together solar panel innovators, wind energy pioneers, and green power investors.",
    bannerImage: "https://images.unsplash.com/photo-1509391365360-2e959784a276",
    venue: "Fort Maidan Convention Hall",
    location: {
      type: "Point",
      coordinates: [76.6548, 10.7766], // [longitude, latitude]
    },
    city: "Palakkad",
    state: "Kerala",
    country: "India",
    date: new Date(Date.now() + 45 * 24 * 60 * 60 * 1000),
    endDate: new Date(Date.now() + 46 * 24 * 60 * 60 * 1000),
    registrationDeadline: new Date(Date.now() + 43 * 24 * 60 * 60 * 1000),
    capacity: 300,
    type: EVENT_TYPE.WORKSHOP,
    status: EVENT_STATUS.UPCOMING,
    active: true,
  },
];

async function seedEvents() {
  const db = new Database();
  try {
    await db.connectDb();
    console.log("🌱 Seeding 10 test events around Kerala...");
    const createdEvents = await Event.insertMany(sampleEvents);
    console.log(`✅ Successfully created ${createdEvents.length} events!`);
    createdEvents.forEach((ev) => {
      console.log(
        ` - [${ev.city}] ${ev.title} @ [Lng: ${ev.location.coordinates[0]}, Lat: ${ev.location.coordinates[1]}]`,
      );
    });
  } catch (error) {
    console.error("❌ Error seeding events:", error);
  } finally {
    await db.disconnectDb();
    process.exit(0);
  }
}

seedEvents();
