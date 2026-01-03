import Header from '@/components/Header';
import Hero from '@/components/Hero';
import Features from '@/components/Features';
import HowItWorks from '@/components/HowItWorks';
import About from '@/components/About';
import Footer from '@/components/Footer';

export default function Home() {
  return (
    <main className="min-h-screen bg-black overflow-x-hidden selection:bg-[#4ECCA3] selection:text-black">
      <Header />
      <Hero />
      <Features />
      <HowItWorks />
      <About />
      <Footer />
    </main>
  );
}
