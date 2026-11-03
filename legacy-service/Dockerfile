FROM php:5.6-apache

RUN docker-php-ext-install mysqli \
    && a2enmod rewrite

COPY docker/apache-site.conf /etc/apache2/sites-available/000-default.conf
COPY --chown=www-data:www-data index.php .htaccess /var/www/html/
COPY --chown=www-data:www-data application /var/www/html/application
COPY --chown=www-data:www-data system /var/www/html/system

ENV CI_ENV=production
