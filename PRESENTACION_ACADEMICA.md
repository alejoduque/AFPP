# BioMapp — Plataforma de Cartografía Sonora para Monitoreo Bioacústico Comunitario

## Estimados colegas,

Les presento **BioMapp**, una aplicación móvil de código abierto desarrollada para facilitar el monitoreo bioacústico participativo en ecosistemas de bosque seco tropical. La herramienta integra técnicas de cartografía sonora, GPS de alta precisión y metadatos bioacústicos estructurados, ofreciendo un sistema accesible para la captura, análisis espacial y socialización de paisajes sonoros en contextos de conservación comunitaria.

---

## Contexto y Motivación

El bosque seco tropical es uno de los ecosistemas más amenazados de América Latina, con tasas de deforestación que superan el 60% en algunas regiones. El monitoreo de biodiversidad en estos territorios enfrenta desafíos logísticos y económicos que limitan la participación de comunidades locales, estudiantes y organizaciones de base. BioMapp surge como respuesta a esta necesidad: una plataforma móvil que permite documentar la riqueza bioacústica del territorio sin necesidad de equipos costosos, convirtiendo smartphones en herramientas científicas georeferenciadas.

---

## Capacidades Técnicas Actuales

### 1. **Registro Bioacústico Georeferenciado**
- Grabaciones de audio de hasta 5 minutos con GPS de alta precisión (precisión <10m en condiciones óptimas)
- Metadatos bioacústicos estructurados por registro:
  - **Taxonomía**: etiquetas de especies (múltiples por grabación)
  - **Estratificación espacial**: posición vertical estimada (dosel, sotobosque, suelo)
  - **Contexto ecológico**: hábitat, tipo de actividad (canto, llamado, alarma), distancia estimada al organismo
  - **Condiciones ambientales**: clima, temperatura, presencia de antropofonía
  - **Calidad de señal**: evaluación subjetiva de claridad espectral
- Marcadores visuales en el mapa proporcionales a la duración de la grabación (círculos escalados por zoom para evitar superposición)

### 2. **Derivas Sonoras (SoundWalks Automáticos)**
- Auto-inicio de sesión de caminata cuando el usuario se desplaza >5m desde posición inicial
- Trazado GPS continuo con visualización en tiempo real (breadcrumb trail animado)
- Auto-detención tras 10 minutos de inactividad
- Cada deriva genera:
  - **Tracklog GeoJSON** con LineString de la ruta completa
  - **Puntos GPS** con marcas temporales, nivel de audio detectado, estado de movimiento
  - **Visualización por intensidad**: segmentos de línea coloreados según nivel de audio capturado (verde=movimiento, rojo=alta intensidad sonora, gris=estacionario)
- Exportable como paquetes ZIP "Deriva Sonora" con esquema versionado (v2.1) para intercambio entre dispositivos

### 3. **Modos de Reproducción Espacial**
La aplicación ofrece **9 modos de escucha** que reorganizan las grabaciones según criterios bioacústicos y artísticos, permitiendo explorar el paisaje sonoro desde múltiples perspectivas:

#### **Modos Bioacústicos**
- **Cercanos** 📍: Reproduce grabaciones dentro de 100m con paneo estéreo según orientación GPS y atenuación por distancia
- **Reloj** 🕐: Filtra grabaciones capturadas en la misma hora del día (±15/30/60 min) para comparar patrones circadianos
- **Alba** 🌅 / **Crepúsculo** 🌇: Reproducción exclusiva de registros capturados durante horas de amanecer/atardecer calculadas astronómicamente para cada coordenada GPS
- **Estratos** 🌿: Ordenamiento por contenido frecuencial estimado (proxy: duración de grabación), simulando estratos ecoacústicos verticales

#### **Modos de Arte Sonoro**
- **Cronológico** 📅: Secuencia temporal de todas las grabaciones
- **Jamm** 🎛️: Reproducción simultánea de todas las pistas visibles con paneo L↔R independiente por canal
- **Migratoria** 🦋: Sigue el orden de captura dentro de una deriva específica (ruta del caminante)
- **Espectro** 🌈: Ordenamiento por estimación de contenido espectral

### 4. **Interoperabilidad Cross-Platform**
- **Exportación/Importación ZIP**: Paquetes completos de sesiones (audio + metadatos + tracklogs) compatibles entre dispositivos Android, iOS y web
- **Formato de audio universal**: Preferencia por `audio/mp4` (AAC) para compatibilidad con Safari/iOS sin transcodificación
- **Validación de integridad**: Sistema de guardado atómico (blob primero, metadatos sólo tras éxito) que previene corrupción de datos
- **Gestión de archivos grandes**: Grabaciones >5MB se guardan automáticamente en sistema de archivos nativo (bypass de límite localStorage)
- **Esquema de metadatos versionado**: Compatibilidad retroactiva entre v2.0 (flat) y v2.1 (structured)

### 5. **Capas Cartográficas Múltiples**
- 7 proveedores de tiles: OpenStreetMap, OpenTopoMap, CartoDB, OSM Humanitarian, Stadia Satellite, Esri World Imagery, CyclOSM
- Zoom adaptativo durante caminatas (z19 inicio, reducción logarítmica según distancia recorrida)
- Visualización simultánea de múltiples derivas con código de color único por sesión

---

## Potencial para Apropiación Comunitaria en Bosque Seco Tropical

### **1. Monitoreo Fenológico Acústico Distribuido**
La sincronización de relojes de canto (modo **Reloj**) y filtros solares (**Alba/Crepúsculo**) permite a comunidades locales documentar patrones de actividad acústica estacional sin necesidad de coordinación centralizada. Ejemplo: grupos de estudiantes en diferentes fragmentos de bosque pueden grabar durante las mismas ventanas temporales circadianas y comparar densidad de especies vía modo **Cercanos**.

### **2. Ciencia Ciudadana con Trazabilidad GPS**
Cada grabación incluye coordenadas precisas, permitiendo:
- Generación de mapas de calor de riqueza acústica
- Detección de zonas de alta biodiversidad (hotspots)
- Monitoreo de cambios en paisajes sonoros post-restauración
- Validación cruzada entre observadores (múltiples registros en mismo punto GPS)

### **3. Educación Ambiental Experiencial**
Los modos **Jamm** y **Migratoria** convierten los datos científicos en experiencias sonoras inmersivas, útiles para:
- Talleres de ecología acústica con comunidades
- Instalaciones de arte sonoro en contextos de educación ambiental
- Narrativas territoriales basadas en trayectorias de caminata (derivas)

### **4. Protocolo Abierto para Redes de Monitoreo**
El formato ZIP "Deriva Sonora" permite:
- Intercambio de grabaciones entre investigadores sin pérdida de metadatos
- Construcción de repositorios comunitarios de paisajes sonoros
- Comparación de sitios sin necesidad de centralizar bases de datos

### **5. Bajo Costo y Autonomía Técnica**
- **Hardware**: Cualquier smartphone Android/iOS con GPS
- **Licencia**: Código abierto (CC BY-NC-SA 4.0), sin costos de licenciamiento
- **Conectividad**: Funciona offline; exportación/importación vía archivos locales
- **Capacitación**: Interfaz intuitiva con iconografía visual y modos autoexplicativos

---

## Casos de Uso Propuestos

### **Investigación Académica**
- Tesis de pregrado/posgrado sobre patrones espaciotemporales de anurofauna o avifauna
- Comparación de comunidades acústicas en gradientes de perturbación (bosque primario vs. secundario vs. borde)
- Validación de hipótesis sobre relaciones entre estructura de hábitat y estratificación acústica vertical

### **Monitoreo Comunitario**
- Guardabosques comunitarios documentando presencia de especies indicadoras
- Escuelas rurales construyendo bibliotecas sonoras del territorio
- Organizaciones de base generando evidencia para declaratorias de áreas protegidas

### **Restauración Ecológica**
- Línea base acústica pre-intervención
- Seguimiento post-plantación de enriquecimiento
- Evaluación de retorno de fauna mediante índices acústicos comparativos

---

## Desarrollos Futuros

Actualmente estamos trabajando en:
1. **Índices acústicos automatizados** (ACI, ADI, H') calculados por grabación
2. **Detección de especies vía aprendizaje automático** (modelos ligeros on-device)
3. **Sincronización multi-dispositivo** para grabaciones simultáneas espaciadas
4. **Exportación a formatos estándar de bioacústica** (Raven selection tables, Audacity labels)

---

## Invitación a Colaboración

BioMapp es un proyecto en construcción activa, desarrollado en diálogo con Reserva MANAKAI (Antioquia, Colombia). Estamos buscando:

- **Validación científica**: Protocolos de muestreo estandarizados para bosque seco tropical
- **Casos de prueba**: Grupos de investigación o comunidades interesadas en pilotar la herramienta
- **Retroalimentación taxonómica**: Expansión de campos de metadatos para grupos específicos (anfibios, mamíferos, insectos)
- **Colaboración metodológica**: Diseño de experimentos que aprovechen los modos de reproducción espacial

---

## Acceso y Contacto

**Repositorio GitHub**: [Próximamente público — actualmente en fase de validación]
**Licencia**: Creative Commons BY-NC-SA 4.0
**Plataformas**: Android (APK nativo), iOS (Capacitor), Web (PWA)

**Desarrollador principal**:
Alejandro Duque Jaramillo
En colaboración con Reserva MANAKAI

---

Si les interesa explorar el potencial de esta herramienta en sus líneas de investigación o proyectos de extensión comunitaria, con gusto agendamos una demostración técnica o sesión de trabajo conjunto.

**El bosque seco suena, y ahora podemos mapear su voz colectiva.**

---

*Documento generado: 19 de febrero de 2026*
*Versión de la aplicación: v2.1+ (unreleased)*
